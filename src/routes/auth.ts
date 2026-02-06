import express, { Request, Response } from 'express';
import { AuthService } from '../services/auth.js';
import { HTTP_STATUS } from '../constants.js';
import { logger } from '../utils/logger.js';
import { validateRequest } from '../middleware/validation.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import {
  registerHumanSchema,
  loginSchema,
  createAgentSchema,
  agentLoginSchema,
} from '../validators/schemas.js';

export const authRouter = express.Router();

/**
 * POST /api/auth/register
 * Register a new human user
 */
authRouter.post(
  '/register',
  authLimiter,
  validateRequest(registerHumanSchema),
  async (req: Request, res: Response) => {
    try {
      const { username, email, password } = req.body;

      const human = await AuthService.registerHuman(username, email, password);

      res.status(HTTP_STATUS.CREATED).json({
        human_id: human.human_id,
        username: human.username,
        email: human.email,
        created_at: human.created_at,
      });
    } catch (error: unknown) {
      const err = error as Error;
      logger.error('Registration error:', err);
      res.status(HTTP_STATUS.BAD_REQUEST).json({ error: err.message });
    }
  }
);

/**
 * POST /api/auth/login
 * Login human user
 */
authRouter.post(
  '/login',
  authLimiter,
  validateRequest(loginSchema),
  async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;

      const { human, token } = await AuthService.loginHuman(username, password);

      res.status(HTTP_STATUS.OK).json({
        token,
        human: {
          human_id: human.human_id,
          username: human.username,
          email: human.email,
        },
      });
    } catch (error: unknown) {
      const err = error as Error;
      logger.error('Login error:', err);
      res
        .status(HTTP_STATUS.UNAUTHORIZED)
        .json({ error: err.message });
    }
  }
);

/**
 * POST /api/auth/agent/login
 * Login agent user
 */
authRouter.post(
  '/agent/login',
  authLimiter,
  validateRequest(agentLoginSchema),
  async (req: Request, res: Response) => {
    try {
      const { agent_username, agent_password } = req.body;

      const { agent, token } = await AuthService.loginAgent(
        agent_username,
        agent_password
      );

      res.status(HTTP_STATUS.OK).json({
        token,
        agent: {
          agent_id: agent.agent_id,
          agent_username: agent.agent_username,
          did: agent.did,
        },
      });
    } catch (error: unknown) {
      const err = error as Error;
      logger.error('Agent login error:', err);
      res
        .status(HTTP_STATUS.UNAUTHORIZED)
        .json({ error: err.message });
    }
  }
);

/**
 * POST /api/auth/agent/register
 * Register new agent for authenticated human
 */
authRouter.post(
  '/agent/register',
  authLimiter,
  validateRequest(createAgentSchema),
  async (req: Request, res: Response) => {
    try {
      const { first_name, last_name, agent_password } = req.body;
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({
          error: 'Missing authorization token',
        });
      }

      const token = authHeader.substring(7);
      const payload = AuthService.verifyToken(token);

      if (payload.type !== 'human') {
        return res.status(HTTP_STATUS.FORBIDDEN).json({
          error: 'Only humans can register agents',
        });
      }

      const { agent, recoveryWords, wallets } = await AuthService.createAgent(
        payload.sub,
        first_name,
        last_name,
        agent_password
      );

      res.status(HTTP_STATUS.CREATED).json({
        agent_id: agent.agent_id,
        agent_username: agent.agent_username,
        api_key: agent.api_key,
        did: agent.did,
        created_at: agent.created_at,
        recovery_words: recoveryWords,
        wallets: wallets.map((w) => ({
          wallet_id: w.wallet_id,
          chain: w.chain,
          address: w.address,
          type: w.type,
        })),
        message: '⚠️ SAVE THESE RECOVERY WORDS! You can only see them once.',
      });
    } catch (error: unknown) {
      const err = error as Error;
      logger.error('Agent registration error:', err);
      res.status(HTTP_STATUS.BAD_REQUEST).json({ error: err.message });
    }
  }
);

/**
 * POST /api/auth/agent/register-self
 * Agent self-registers with human info
 * Creates both human and agent, agent handles everything
 */
authRouter.post(
  '/agent/register-self',
  authLimiter,
  async (req: Request, res: Response) => {
    try {
      const { human_username, human_email, first_name, last_name, agent_password } = req.body;

      // Validate required fields
      if (!human_username || !human_email || !first_name || !last_name || !agent_password) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          error: 'Missing required fields: human_username, human_email, first_name, last_name, agent_password',
        });
      }

      // Validate password strength
      if (agent_password.length < 8) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          error: 'Password must be at least 8 characters',
        });
      }
      if (!/[A-Z]/.test(agent_password)) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          error: 'Password must contain an uppercase letter',
        });
      }
      if (!/[0-9]/.test(agent_password)) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          error: 'Password must contain a number',
        });
      }
      if (!/[^a-zA-Z0-9]/.test(agent_password)) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          error: 'Password must contain a special character',
        });
      }

      const { agent, token, agentUsername, recoveryWords, wallets } = await AuthService.registerAgentSelf(
        human_username,
        human_email,
        first_name,
        last_name,
        agent_password
      );

      res.status(HTTP_STATUS.CREATED).json({
        agent_id: agent.agent_id,
        agent_username: agentUsername,
        api_key: agent.api_key,
        did: agent.did,
        token,
        recovery_words: recoveryWords,
        wallets: wallets.map((w) => ({
          wallet_id: w.wallet_id,
          chain: w.chain,
          address: w.address,
          type: w.type,
        })),
        message: 'Agent self-registered successfully. Save your recovery words!',
      });
    } catch (error: unknown) {
      const err = error as Error;
      logger.error('Agent self-registration error:', err);
      res.status(HTTP_STATUS.BAD_REQUEST).json({ error: err.message });
    }
  }
);

/**
 * POST /api/auth/refresh
 * Refresh JWT token
 */
authRouter.post('/refresh', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        error: 'Missing authorization token',
      });
    }

    const token = authHeader.substring(7);
    const payload = AuthService.verifyToken(token);

    const newToken = AuthService.generateToken(
      payload.sub,
      payload.type,
      payload.username
    );

    res.status(HTTP_STATUS.OK).json({ token: newToken });
  } catch (error: any) {
    logger.error('Token refresh error:', error);
    res
      .status(HTTP_STATUS.UNAUTHORIZED)
      .json({ error: error.message });
  }
});

