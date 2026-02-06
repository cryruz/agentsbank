/**
 * AgentsBank SDK Client
 * Main API client for interacting with AgentsBank services
 */

import {
  AgentsBankConfig,
  AgentsBankError,
  RegisterAgentRequest,
  RegisterAgentResponse,
  LoginRequest,
  LoginResponse,
  Chain,
  WalletInfo,
  CreateWalletResponse,
  GetBalanceResponse,
  SendTransactionRequest,
  SendTransactionResponse,
  SignMessageResponse,
  EstimateGasResponse,
  TransactionHistoryResponse,
  CatalogueResponse,
} from './types.js';

const DEFAULT_BASE_URL = 'https://api.agentsbank.online';
const DEFAULT_TIMEOUT = 30000;

export class AgentsBank {
  private baseUrl: string;
  private apiKey?: string;
  private token?: string;
  private timeout: number;
  private fetchImpl: typeof fetch;

  constructor(config: AgentsBankConfig = {}) {
    this.baseUrl = config.baseUrl || DEFAULT_BASE_URL;
    this.apiKey = config.apiKey;
    this.token = config.token;
    this.timeout = config.timeout || DEFAULT_TIMEOUT;
    this.fetchImpl = config.fetch || globalThis.fetch;

    if (!this.fetchImpl) {
      throw new Error('fetch is not available. Please provide a fetch implementation.');
    }
  }

  // ============================================
  // CONFIGURATION
  // ============================================

  /**
   * Set JWT token for authentication
   */
  setToken(token: string): void {
    this.token = token;
  }

  /**
   * Set API key for authentication
   */
  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  /**
   * Get current authentication status
   */
  isAuthenticated(): boolean {
    return !!(this.token || this.apiKey);
  }

  // ============================================
  // HTTP HELPERS
  // ============================================

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    } else if (this.apiKey) {
      headers['x-api-key'] = this.apiKey;
    }

    return headers;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await this.fetchImpl(url, {
        method,
        headers: this.getHeaders(),
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await response.json();

      if (!response.ok) {
        throw new AgentsBankError(
          data.error || 'Request failed',
          response.status,
          data.code,
          data.details
        );
      }

      return data as T;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof AgentsBankError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new AgentsBankError('Request timeout', 408);
        }
        throw new AgentsBankError(error.message, 500);
      }

      throw new AgentsBankError('Unknown error', 500);
    }
  }

  // ============================================
  // AUTHENTICATION
  // ============================================

  /**
   * Register a new agent (self-registration)
   * Creates both human and agent accounts
   * 
   * @example
   * ```ts
   * const result = await client.register({
   *   human_username: 'myuser',
   *   human_email: 'user@example.com',
   *   first_name: 'John',
   *   last_name: 'Doe',
   *   agent_password: 'SecurePass123!'
   * });
   * 
   * // Save the token for future requests
   * client.setToken(result.token);
   * 
   * // IMPORTANT: Save recovery words securely!
   * console.log(result.recovery_words);
   * ```
   */
  async register(request: RegisterAgentRequest): Promise<RegisterAgentResponse> {
    const response = await this.request<RegisterAgentResponse>(
      'POST',
      '/api/auth/agent/register-self',
      request
    );
    
    // Auto-set token after registration
    if (response.token) {
      this.token = response.token;
    }
    
    return response;
  }

  /**
   * Login with agent credentials
   * 
   * @example
   * ```ts
   * const result = await client.login({
   *   agent_username: 'agent_123456_abc',
   *   agent_password: 'SecurePass123!'
   * });
   * 
   * client.setToken(result.token);
   * ```
   */
  async login(request: LoginRequest): Promise<LoginResponse> {
    const response = await this.request<LoginResponse>(
      'POST',
      '/api/auth/agent/login',
      request
    );
    
    // Auto-set token after login
    if (response.token) {
      this.token = response.token;
    }
    
    return response;
  }

  /**
   * Refresh the JWT token
   */
  async refreshToken(): Promise<{ token: string }> {
    const response = await this.request<{ token: string }>(
      'POST',
      '/api/auth/refresh'
    );
    
    if (response.token) {
      this.token = response.token;
    }
    
    return response;
  }

  // ============================================
  // WALLETS
  // ============================================

  /**
   * Create a new wallet on the specified chain
   * 
   * @example
   * ```ts
   * const wallet = await client.createWallet('solana');
   * console.log(wallet.address); // Solana address
   * ```
   */
  async createWallet(chain: Chain): Promise<CreateWalletResponse> {
    return this.request<CreateWalletResponse>('POST', '/api/wallets', { chain });
  }

  /**
   * Get wallet details by ID
   */
  async getWallet(walletId: string): Promise<WalletInfo> {
    return this.request<WalletInfo>('GET', `/api/wallets/${walletId}`);
  }

  /**
   * Get wallet balance (fetches from blockchain)
   * 
   * @example
   * ```ts
   * const { balance } = await client.getBalance(walletId);
   * console.log(`SOL: ${balance.SOL}`);
   * console.log(`USDC: ${balance.USDC}`);
   * ```
   */
  async getBalance(walletId: string): Promise<GetBalanceResponse> {
    return this.request<GetBalanceResponse>('GET', `/api/wallets/${walletId}/balance`);
  }

  /**
   * Get transaction history for a wallet
   */
  async getTransactionHistory(
    walletId: string,
    limit?: number
  ): Promise<TransactionHistoryResponse> {
    const query = limit ? `?limit=${limit}` : '';
    return this.request<TransactionHistoryResponse>(
      'GET',
      `/api/wallets/${walletId}/history${query}`
    );
  }

  // ============================================
  // TRANSACTIONS
  // ============================================

  /**
   * Send a transaction from a wallet
   * 
   * @example
   * ```ts
   * // Send native token (SOL, ETH, BNB, BTC)
   * const tx = await client.send(walletId, {
   *   to_address: 'recipient_address',
   *   amount: '0.1'
   * });
   * 
   * // Send token (USDC, USDT)
   * const tx = await client.send(walletId, {
   *   to_address: 'recipient_address',
   *   amount: '100',
   *   currency: 'USDC'
   * });
   * ```
   */
  async send(
    walletId: string,
    request: SendTransactionRequest
  ): Promise<SendTransactionResponse> {
    return this.request<SendTransactionResponse>(
      'POST',
      `/api/wallets/${walletId}/send`,
      request
    );
  }

  /**
   * Estimate gas/fees for a transaction
   */
  async estimateGas(
    walletId: string,
    toAddress: string,
    amount: string
  ): Promise<EstimateGasResponse> {
    return this.request<EstimateGasResponse>(
      'GET',
      `/api/wallets/${walletId}/estimate-gas?to_address=${encodeURIComponent(toAddress)}&amount=${encodeURIComponent(amount)}`
    );
  }

  // ============================================
  // SIGNING
  // ============================================

  /**
   * Sign a message with wallet's private key
   * Useful for authentication with external services
   * 
   * @example
   * ```ts
   * const { signature } = await client.signMessage(walletId, 'Hello, World!');
   * // Use signature to prove ownership of the address
   * ```
   */
  async signMessage(walletId: string, message: string): Promise<SignMessageResponse> {
    return this.request<SignMessageResponse>(
      'POST',
      `/api/wallets/${walletId}/sign-message`,
      { message }
    );
  }

  // ============================================
  // CATALOGUE
  // ============================================

  /**
   * Get supported chains and tokens
   */
  async getCatalogue(): Promise<CatalogueResponse> {
    return this.request<CatalogueResponse>('GET', '/api/catalogue/chains');
  }

  // ============================================
  // HEALTH
  // ============================================

  /**
   * Check API health status
   */
  async health(): Promise<{ status: string; timestamp: string; version: string }> {
    return this.request<{ status: string; timestamp: string; version: string }>(
      'GET',
      '/health'
    );
  }
}

/**
 * Create a new AgentsBank client instance
 * 
 * @example
 * ```ts
 * import { createClient } from '@agentsbank/sdk';
 * 
 * const client = createClient({
 *   apiKey: 'your-api-key'
 * });
 * 
 * // Or with token
 * const client = createClient({
 *   token: 'your-jwt-token'
 * });
 * ```
 */
export function createClient(config?: AgentsBankConfig): AgentsBank {
  return new AgentsBank(config);
}
