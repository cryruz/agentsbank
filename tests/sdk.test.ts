import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AgentsBankSDK } from '../src/sdk/index';

describe('AgentsBankSDK', () => {
  let sdk: AgentsBankSDK;
  const apiUrl = 'http://localhost:3000/api';

  beforeAll(() => {
    sdk = new AgentsBankSDK({
      apiUrl,
      agentUsername: 'test_agent',
      agentPassword: 'TestPassword123!',
    });
  });

  it('should initialize SDK', () => {
    expect(sdk).toBeDefined();
  });

  it('should throw error without credentials', async () => {
    const emptySdk = new AgentsBankSDK({ apiUrl });
    try {
      await emptySdk.login();
      expect.fail('Should have thrown error');
    } catch (error: any) {
      expect(error.message).toContain('required');
    }
  });

  // Note: These tests require running backend
  it.skip('should login agent', async () => {
    const token = await sdk.login();
    expect(token).toBeTruthy();
    expect(token.length).toBeGreaterThan(0);
  });

  it.skip('should create wallet', async () => {
    const wallet = await sdk.createWallet('ethereum', 'non-custodial');
    expect(wallet.wallet_id).toBeTruthy();
    expect(wallet.chain).toBe('ethereum');
    expect(wallet.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });

  it.skip('should get wallet balance', async () => {
    const wallets = await sdk.listWallets();
    if (wallets.length > 0) {
      const balance = await sdk.getBalance(wallets[0].wallet_id);
      expect(balance).toBeDefined();
      expect(balance.native).toBeDefined();
    }
  });

  it.skip('should estimate gas', async () => {
    const wallets = await sdk.listWallets();
    if (wallets.length > 0) {
      const estimate = await sdk.estimateGas(
        wallets[0].wallet_id,
        '0x742d35Cc6634C0532925a3b844Bc9e7595f7c8c',
        '0.1'
      );
      expect(estimate.estimated_gas).toBeTruthy();
    }
  });
});
