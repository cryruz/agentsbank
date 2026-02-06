import jwt, { SignOptions } from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { supabase, supabaseAdmin, type Agent, type Human, type Wallet } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { generateRecoveryWords } from '../utils/recovery.js';
import { WalletService } from './wallet.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export interface AuthTokenPayload {
  sub: string;
  type: 'human' | 'agent';
  username: string;
  iat: number;
  exp: number;
}

export class AuthService {
  /**
   * Register a new human user
   */
  static async registerHuman(
    username: string,
    email: string,
    password: string
  ): Promise<Human> {
    const humanId = uuidv4();
    const passwordHash = await bcrypt.hash(password, 12);

    const { data, error } = await supabaseAdmin
      .from('humans')
      .insert({
        human_id: humanId,
        username,
        email,
        password_hash: passwordHash,
        created_at: new Date().toISOString(),
        mfa_enabled: false,
      })
      .select()
      .single();

    if (error) {
      if (error.message.includes('duplicate')) {
        throw new Error('Username or email already exists');
      }
      throw error;
    }

    logger.info(`Human registered: ${username}`);
    return data;
  }

  /**
   * Login human user
   */
  static async loginHuman(username: string, password: string): Promise<{ human: Human; token: string }> {
    const { data, error } = await supabaseAdmin
      .from('humans')
      .select()
      .eq('username', username)
      .single();

    if (error || !data) {
      throw new Error('Invalid credentials');
    }

    const passwordMatch = await bcrypt.compare(password, data.password_hash);
    if (!passwordMatch) {
      throw new Error('Invalid credentials');
    }

    // Update last login
    await supabaseAdmin
      .from('humans')
      .update({ last_login: new Date().toISOString() })
      .eq('human_id', data.human_id);

    const token = AuthService.generateToken(data.human_id, 'human', username);
    logger.info(`Human logged in: ${username}`);

    return { human: data, token };
  }

  /**
   * Create agent for a human with recovery words
   * Automatically creates wallets for all supported chains
   */
  static async createAgent(
    humanId: string,
    firstName: string,
    lastName: string,
    agentPassword: string
  ): Promise<{ agent: Agent; recoveryWords: string[]; wallets: Wallet[] }> {
    const agentId = uuidv4();
    const agentUsername = `agent_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const agentPasswordHash = await bcrypt.hash(agentPassword, 12);
    const apiKey = uuidv4();
    const did = `did:agentsbank:${agentId}`;

    // Generate recovery words (33 words from BIP39)
    const recoveryWords = generateRecoveryWords();
    const recoveryWordsHash = crypto
      .createHash('sha256')
      .update(recoveryWords.join(' '))
      .digest('hex');

    const { data, error } = await supabaseAdmin
      .from('agents')
      .insert({
        agent_id: agentId,
        human_id: humanId,
        first_name: firstName,
        last_name: lastName,
        agent_username: agentUsername,
        agent_password_hash: agentPasswordHash,
        api_key: apiKey,
        did,
        reputation_score: 0,
        status: 'active',
        date_of_birth: new Date().toISOString(),
        recovery_words_hash: recoveryWordsHash,
        guardrails: {
          max_daily_spend: '1000',
          max_transaction_amount: '100',
        },
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    // Create wallets for all supported chains
    const wallets = await WalletService.createWalletsForAllChains(agentId);

    logger.info(`Agent created for human ${humanId}: ${agentUsername} with ${wallets.length} wallets`);
    return { agent: data, recoveryWords, wallets };
  }

  /**
   * Authenticate agent via username/password
   */
  static async loginAgent(agentUsername: string, agentPassword: string): Promise<{ agent: Agent; token: string }> {
    const { data, error } = await supabaseAdmin
      .from('agents')
      .select()
      .eq('agent_username', agentUsername)
      .single();

    if (error || !data) {
      throw new Error('Invalid agent credentials');
    }

    const passwordMatch = await bcrypt.compare(agentPassword, data.agent_password_hash);
    if (!passwordMatch) {
      throw new Error('Invalid agent credentials');
    }

    const token = AuthService.generateToken(data.agent_id, 'agent', agentUsername);
    logger.info(`Agent logged in: ${agentUsername}`);

    return { agent: data, token };
  }

  /**
   * Authenticate agent via API key
   */
  static async authenticateAgentByApiKey(apiKey: string): Promise<Agent> {
    const { data, error } = await supabaseAdmin
      .from('agents')
      .select()
      .eq('api_key', apiKey)
      .single();

    if (error || !data) {
      throw new Error('Invalid API key');
    }

    if (data.status !== 'active') {
      throw new Error('Agent is not active');
    }

    return data;
  }

  /**
   * Generate JWT token
   */
  static generateToken(userId: string, type: 'human' | 'agent', username: string): string {
    return jwt.sign(
      {
        sub: userId,
        type,
        username,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN || '7d' } as any
    );
  }

  /**
   * Verify JWT token
   */
  static verifyToken(token: string): AuthTokenPayload {
    try {
      return jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  /**
   * Verify API key and return auth payload
   */
  static async verifyApiKey(apiKey: string): Promise<AuthTokenPayload> {
    try {
      const agent = await this.authenticateAgentByApiKey(apiKey);
      return {
        sub: agent.agent_id,
        type: 'agent',
        username: agent.agent_username,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 86400 * 7, // 7 days
      };
    } catch (error) {
      throw new Error('Invalid API key');
    }
  }

  /**
   * Agent self-registers with human info
   * Creates both human and agent in one transaction
   * Returns recovery words for account recovery and created wallets
   */
  static async registerAgentSelf(
    humanUsername: string,
    humanEmail: string,
    firstName: string,
    lastName: string,
    agentPassword: string
  ): Promise<{ agent: Agent; token: string; agentUsername: string; recoveryWords: string[]; wallets: Wallet[] }> {
    try {
      // First check if human already exists
      const { data: existingHuman } = await supabaseAdmin
        .from('humans')
        .select()
        .eq('username', humanUsername)
        .single();

      let humanId: string;
      if (existingHuman) {
        humanId = existingHuman.human_id;
        logger.info(`Using existing human: ${humanUsername}`);
      } else {
        // Create human account
        const tempPassword = `temp_${uuidv4()}`; // Agent will manage passwords
        const passwordHash = await bcrypt.hash(tempPassword, 12);
        const newHumanId = uuidv4();

        const { data: newHuman, error: humanError } = await supabaseAdmin
          .from('humans')
          .insert({
            human_id: newHumanId,
            username: humanUsername,
            email: humanEmail,
            password_hash: passwordHash,
            created_at: new Date().toISOString(),
            mfa_enabled: false,
          })
          .select()
          .single();

        if (humanError) {
          if (humanError.message.includes('duplicate')) {
            throw new Error('Username or email already exists');
          }
          throw humanError;
        }

        humanId = newHuman.human_id;
        logger.info(`Human registered: ${humanUsername}`);
      }

      // Create agent (includes recovery words and wallets)
      const { agent, recoveryWords, wallets } = await this.createAgent(humanId, firstName, lastName, agentPassword);

      // Generate token
      const token = this.generateToken(agent.agent_id, 'agent', agent.agent_username);

      logger.info(`Agent self-registered with ${wallets.length} wallets: ${agent.agent_username}`);

      return {
        agent,
        token,
        agentUsername: agent.agent_username,
        recoveryWords,
        wallets,
      };
    } catch (error) {
      logger.error('Agent self-registration failed:', error);
      throw error;
    }
  }

  /**
   * Regenerate agent API key
   */
  static async regenerateApiKey(agentId: string): Promise<string> {
    const newApiKey = uuidv4();

    const { error } = await supabase
      .from('agents')
      .update({ api_key: newApiKey })
      .eq('agent_id', agentId);

    if (error) throw error;

    logger.info(`API key regenerated for agent ${agentId}`);
    return newApiKey;
  }
}
