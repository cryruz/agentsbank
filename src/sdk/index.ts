/**
 * AgentsBank.ai SDK for Agents
 * 
 * Usage:
 * import { AgentsBankSDK } from '@agentsbank/sdk';
 * 
 * const bank = new AgentsBankSDK({
 *   apiUrl: 'https://api.agentsbank.ai',
 *   agentUsername: 'agent_...',
 *   agentPassword: 'password',
 * });
 * 
 * const wallet = await bank.createWallet('ethereum');
 */

import axios, { AxiosInstance } from 'axios';

export interface SDKConfig {
  apiUrl: string;
  agentUsername?: string;
  agentPassword?: string;
  apiKey?: string;
  token?: string;
}

export interface WalletInfo {
  wallet_id: string;
  agent_id: string;
  chain: string;
  address: string;
  type: 'custodial' | 'non-custodial';
  balance: Record<string, string>;
  created_at: string;
}

export interface TransactionInfo {
  tx_id: string;
  wallet_id: string;
  type: string;
  amount: string;
  currency: string;
  from_address: string;
  to_address: string;
  tx_hash?: string;
  status: 'pending' | 'confirmed' | 'failed';
  fee: string;
  timestamp: string;
}

export interface RegistrationInfo {
  agentUsername: string;
  agentPassword: string;
  humanUsername: string;
  humanEmail: string;
  firstName: string;
  lastName: string;
}

export interface PromptFunction {
  (message: string): Promise<string>;
}

export class AgentsBankSDK {
  private client: AxiosInstance;
  private config: SDKConfig;
  private token?: string;

  constructor(config: SDKConfig) {
    this.config = config;
    this.token = config.token;

    this.client = axios.create({
      baseURL: config.apiUrl,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add token to all requests
    this.client.interceptors.request.use((conf) => {
      if (this.token) {
        conf.headers.Authorization = `Bearer ${this.token}`;
      }
      if (config.apiKey) {
        conf.headers['X-API-Key'] = config.apiKey;
      }
      return conf;
    });
  }

  /**
   * Self-register agent as autonomous entity
   * Agent can ask its human for information or use provided values
   * 
   * @param options Configuration for registration
   *   - humanUsername: Owner's username
   *   - humanEmail: Owner's email  
   *   - firstName: Agent first name
   *   - lastName: Agent last name
   *   - agentPassword: Agent password (min 8 chars, uppercase, number, special char)
   *   - promptFn: Custom prompt function (default uses console)
   */
  async registerSelf(
    options?: {
      humanUsername?: string;
      humanEmail?: string;
      firstName?: string;
      lastName?: string;
      agentPassword?: string;
      promptFn?: PromptFunction;
    }
  ): Promise<{ agentUsername: string; agentPassword: string; token: string; recoveryWords: string[] }> {
    const promptFn = options?.promptFn || this.defaultPrompt.bind(this);
    let humanUsername = options?.humanUsername;
    let humanEmail = options?.humanEmail;
    let firstName = options?.firstName;
    let lastName = options?.lastName;
    let agentPassword = options?.agentPassword;

    console.log('\n🤖 Agent Self-Registration');
    console.log('========================\n');
    console.log('I need to register you and your human owner.\n');

    // Collect human information
    if (!humanUsername) {
      humanUsername = await promptFn('Human username:');
      if (!humanUsername.trim()) throw new Error('Human username is required');
    }

    if (!humanEmail) {
      humanEmail = await promptFn('Human email:');
      if (!humanEmail.trim()) throw new Error('Human email is required');
    }

    if (!firstName) {
      firstName = await promptFn('Agent first name (default: AI):');
      if (!firstName.trim()) firstName = 'AI';
    }

    if (!lastName) {
      lastName = await promptFn('Agent last name (default: Agent):');
      if (!lastName.trim()) lastName = 'Agent';
    }

    // Prompt for password with validation
    if (!agentPassword) {
      let passwordValid = false;
      while (!passwordValid) {
        agentPassword = await promptFn(
          'Agent password (min 8 chars, 1 uppercase, 1 number, 1 special char):'
        );

        if (!agentPassword.trim()) {
          console.log('❌ Password is required');
          continue;
        }

        const validation = this.validatePassword(agentPassword);
        if (!validation.valid) {
          console.log('❌ Password requirements not met:');
          validation.errors.forEach((err) => console.log(`   - ${err}`));
          agentPassword = undefined;
          continue;
        }

        passwordValid = true;
      }
    }

    // Call registration endpoint
    const { data } = await this.client.post('/auth/agent/register-self', {
      human_username: humanUsername,
      human_email: humanEmail,
      first_name: firstName,
      last_name: lastName,
      agent_password: agentPassword,
    });

    this.token = data.token;
    this.config.agentUsername = data.agent_username;
    this.config.agentPassword = agentPassword;

    console.log('\n✅ Registration successful!');
    console.log(`Agent Username: ${data.agent_username}`);
    console.log(`Agent DID: ${data.did}`);
    
    // Display recovery words prominently
    this.displayRecoveryWords(data.recovery_words);

    return {
      agentUsername: data.agent_username,
      agentPassword: agentPassword!, // Non-null assertion: guaranteed to exist after validation loop
      token: data.token,
      recoveryWords: data.recovery_words,
    };
  }

  /**
   * Default prompt function using readline
   */
  private async defaultPrompt(message: string): Promise<string> {
    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      rl.question(message + ' ', (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    });
  }

  /**
   * Validate password strength
   */
  private validatePassword(password: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (password.length < 8) {
      errors.push('Password must be at least 8 characters');
    }
    if (!/[A-Z]/.test(password)) {
      errors.push('Must contain an uppercase letter');
    }
    if (!/[0-9]/.test(password)) {
      errors.push('Must contain a number');
    }
    if (!/[^a-zA-Z0-9]/.test(password)) {
      errors.push('Must contain a special character');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Display recovery words prominently to user
   */
  private displayRecoveryWords(words: string[]): void {
    console.log('\n' + '='.repeat(70));
    console.log('📝 RECOVERY WORDS - SAVE THESE IMMEDIATELY');
    console.log('='.repeat(70) + '\n');
    
    console.log('Your 33 recovery words for account recovery and migration:\n');
    
    for (let i = 0; i < words.length; i += 3) {
      const group = words.slice(i, Math.min(i + 3, words.length));
      console.log(
        group
          .map((word, idx) => `${(i + idx + 1).toString().padStart(2, '0')}. ${word}`)
          .join('     ')
      );
    }
    
    console.log('\n' + '='.repeat(70));
    console.log('⚠️  CRITICAL INFORMATION:');
    console.log('='.repeat(70));
    console.log('  ✓ Write down these 33 words in order');
    console.log('  ✓ Store them safely (preferably offline)');
    console.log('  ✓ Use them to recover your account if you lose access');
    console.log('  ✓ NEVER share these words with anyone');
    console.log('  ✓ You can only see them once - save them NOW!');
    console.log('  ✓ Keep them separate from your password');
    console.log('\n' + '='.repeat(70) + '\n');
  }

  /**
   * Login with agent credentials
   */
  async login(): Promise<string> {
    if (!this.config.agentUsername || !this.config.agentPassword) {
      throw new Error('agentUsername and agentPassword required for login');
    }

    const { data } = await this.client.post('/auth/agent/login', {
      agent_username: this.config.agentUsername,
      agent_password: this.config.agentPassword,
    });

    this.token = data.token;
    return data.token;
  }

  /**
   * Create a new wallet
   */
  async createWallet(
    chain: 'ethereum' | 'bsc' | 'solana' | 'bitcoin',
    type: 'custodial' | 'non-custodial' = 'non-custodial'
  ): Promise<WalletInfo> {
    if (!this.token) await this.login();

    const { data } = await this.client.post('/wallets', {
      chain,
      type,
    });

    return data;
  }

  /**
   * Get wallet details
   */
  async getWallet(walletId: string): Promise<WalletInfo> {
    const { data } = await this.client.get(`/wallets/${walletId}`);
    return data;
  }

  /**
   * List all wallets for agent
   */
  async listWallets(): Promise<WalletInfo[]> {
    const { data } = await this.client.get('/wallets');
    return data.wallets;
  }

  /**
   * Get wallet balance
   */
  async getBalance(walletId: string): Promise<Record<string, string>> {
    const { data } = await this.client.get(`/wallets/${walletId}/balance`);
    return data.balance;
  }

  /**
   * Estimate gas for transaction
   */
  async estimateGas(
    walletId: string,
    toAddress: string,
    amount: string
  ): Promise<{ estimated_gas: string }> {
    const { data } = await this.client.get(`/wallets/${walletId}/estimate-gas`, {
      params: { to_address: toAddress, amount },
    });
    return data;
  }

  /**
   * Create transaction (supports all tokens)
   */
  async sendTransaction(
    walletId: string,
    toAddress: string,
    amount: string,
    currency: string = 'ETH'
  ): Promise<TransactionInfo> {
    const { data } = await this.client.post('/transactions', {
      wallet_id: walletId,
      to_address: toAddress,
      amount,
      currency,
      type: 'transfer',
    });

    return data;
  }

  /**
   * Send token transfer (USDT, USDC, etc.)
   */
  async sendTokenTransfer(
    walletId: string,
    toAddress: string,
    amount: string,
    token: 'USDT' | 'USDC' | string
  ): Promise<TransactionInfo> {
    return this.sendTransaction(walletId, toAddress, amount, token);
  }

  /**
   * Estimate gas for transaction with token support
   */
  async estimateGasForTransaction(
    walletId: string,
    toAddress: string,
    amount: string,
    currency: string = 'ETH'
  ): Promise<{ gasEstimate: string; gasPrice: string; totalCost: string }> {
    const { data } = await this.client.post('/transactions/estimate-gas', {
      wallet_id: walletId,
      to_address: toAddress,
      amount,
      currency,
    });
    return data;
  }

  /**
   * Get transaction details
   */
  async getTransaction(txId: string): Promise<TransactionInfo> {
    const { data } = await this.client.get(`/transactions/${txId}`);
    return data;
  }

  /**
   * Get transaction history for wallet
   */
  async getTransactionHistory(
    walletId: string,
    limit: number = 50
  ): Promise<TransactionInfo[]> {
    const { data } = await this.client.get(
      `/transactions/wallet/${walletId}`,
      { params: { limit } }
    );
    return data.transactions;
  }

  /**
   * Get transaction statistics
   */
  async getStats(walletId: string, days: number = 30): Promise<any> {
    const { data } = await this.client.get(
      `/transactions/wallet/${walletId}/stats`,
      { params: { days } }
    );
    return data;
  }

  /**
   * Wait for transaction to be confirmed
   */
  async waitForConfirmation(
    txId: string,
    maxWaitMs: number = 300000,
    pollIntervalMs: number = 5000
  ): Promise<TransactionInfo> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      const tx = await this.getTransaction(txId);

      if (tx.status !== 'pending') {
        return tx;
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error('Transaction confirmation timeout');
  }

  /**
   * Update API key
   */
  async regenerateApiKey(): Promise<string> {
    const { data } = await this.client.post('/auth/agent/regenerate-key');
    return data.api_key;
  }

  /**
   * Refresh JWT token
   */
  async refreshToken(): Promise<string> {
    const { data } = await this.client.post('/auth/refresh');
    this.token = data.token;
    return data.token;
  }
}

// Export for convenience
export default AgentsBankSDK;
