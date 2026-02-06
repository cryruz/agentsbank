import { ethers } from 'ethers';
import { logger } from '../utils/logger.js';

const RPC_ENDPOINTS: Record<string, string> = {
  ethereum: process.env.ETH_RPC_URL || 'https://eth-mainnet.g.alchemy.com/v2/demo',
  bsc: process.env.BNB_RPC_URL || 'https://bsc-dataseed.bnbchain.org',
};

// In-memory nonce tracking per address per chain
interface NonceState {
  lastNonce: number;
  pendingNonces: Set<number>;
  lastUpdated: number;
}

const nonceStates: Map<string, NonceState> = new Map();

// Mutex locks for concurrent nonce requests
const nonceLocks: Map<string, Promise<void>> = new Map();

export class NonceManager {
  /**
   * Get the key for nonce state lookup
   */
  private static getKey(chain: string, address: string): string {
    return `${chain}:${address.toLowerCase()}`;
  }

  /**
   * Acquire lock for address to prevent race conditions
   */
  private static async acquireLock(key: string): Promise<() => void> {
    // Wait for any existing lock
    while (nonceLocks.has(key)) {
      await nonceLocks.get(key);
    }

    // Create new lock
    let releaseLock: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    nonceLocks.set(key, lockPromise);

    return () => {
      nonceLocks.delete(key);
      releaseLock!();
    };
  }

  /**
   * Get on-chain nonce for an address
   */
  static async getOnChainNonce(chain: string, address: string): Promise<number> {
    const provider = new ethers.JsonRpcProvider(RPC_ENDPOINTS[chain]);
    return provider.getTransactionCount(address, 'pending');
  }

  /**
   * Get next available nonce for a transaction
   * Handles sequential transactions properly
   */
  static async getNextNonce(chain: string, address: string): Promise<number> {
    const key = this.getKey(chain, address);
    const release = await this.acquireLock(key);

    try {
      const onChainNonce = await this.getOnChainNonce(chain, address);
      let state = nonceStates.get(key);

      // Initialize or refresh state if needed
      if (!state || Date.now() - state.lastUpdated > 60000) {
        state = {
          lastNonce: onChainNonce - 1,
          pendingNonces: new Set(),
          lastUpdated: Date.now(),
        };
        nonceStates.set(key, state);
      }

      // Find next available nonce
      let nextNonce = Math.max(onChainNonce, state.lastNonce + 1);
      while (state.pendingNonces.has(nextNonce)) {
        nextNonce++;
      }

      // Mark as pending
      state.pendingNonces.add(nextNonce);
      state.lastNonce = nextNonce;
      state.lastUpdated = Date.now();

      logger.info(`Allocated nonce ${nextNonce} for ${address} on ${chain}`);
      return nextNonce;
    } finally {
      release();
    }
  }

  /**
   * Mark a nonce as confirmed (transaction mined)
   */
  static async confirmNonce(chain: string, address: string, nonce: number): Promise<void> {
    const key = this.getKey(chain, address);
    const state = nonceStates.get(key);
    
    if (state) {
      state.pendingNonces.delete(nonce);
      logger.info(`Confirmed nonce ${nonce} for ${address} on ${chain}`);
    }
  }

  /**
   * Release a nonce (transaction failed or cancelled)
   */
  static async releaseNonce(chain: string, address: string, nonce: number): Promise<void> {
    const key = this.getKey(chain, address);
    const state = nonceStates.get(key);
    
    if (state) {
      state.pendingNonces.delete(nonce);
      logger.info(`Released nonce ${nonce} for ${address} on ${chain}`);
    }
  }

  /**
   * Reset nonce state for an address (use after stuck transactions)
   */
  static async resetNonceState(chain: string, address: string): Promise<void> {
    const key = this.getKey(chain, address);
    nonceStates.delete(key);
    logger.info(`Reset nonce state for ${address} on ${chain}`);
  }

  /**
   * Get current nonce state for debugging
   */
  static getNonceState(chain: string, address: string): NonceState | undefined {
    const key = this.getKey(chain, address);
    return nonceStates.get(key);
  }

  /**
   * Check for stuck transactions (pending nonces that haven't confirmed)
   */
  static async checkStuckTransactions(chain: string, address: string): Promise<{
    onChainNonce: number;
    pendingNonces: number[];
    hasStuck: boolean;
  }> {
    const onChainNonce = await this.getOnChainNonce(chain, address);
    const key = this.getKey(chain, address);
    const state = nonceStates.get(key);
    
    const pendingNonces = state ? [...state.pendingNonces].sort((a, b) => a - b) : [];
    const hasStuck = pendingNonces.some(n => n < onChainNonce);

    if (hasStuck) {
      // Clean up confirmed nonces
      for (const nonce of pendingNonces) {
        if (nonce < onChainNonce) {
          state?.pendingNonces.delete(nonce);
        }
      }
    }

    return { onChainNonce, pendingNonces, hasStuck };
  }
}
