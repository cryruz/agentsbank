import { describe, it, expect } from 'vitest';
import { registerHumanSchema, createWalletSchema, createTransactionSchema } from '../src/validators/schemas';

describe('Validators', () => {
  describe('registerHumanSchema', () => {
    it('should validate correct registration data', () => {
      const result = registerHumanSchema.safeParse({
        username: 'testuser',
        email: 'test@example.com',
        password: 'TestPassword123!',
      });
      expect(result.success).toBe(true);
    });

    it('should reject weak password', () => {
      const result = registerHumanSchema.safeParse({
        username: 'testuser',
        email: 'test@example.com',
        password: 'weak',
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid email', () => {
      const result = registerHumanSchema.safeParse({
        username: 'testuser',
        email: 'not-an-email',
        password: 'TestPassword123!',
      });
      expect(result.success).toBe(false);
    });

    it('should reject short username', () => {
      const result = registerHumanSchema.safeParse({
        username: 'ab',
        email: 'test@example.com',
        password: 'TestPassword123!',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('createWalletSchema', () => {
    it('should validate valid chain', () => {
      const result = createWalletSchema.safeParse({
        chain: 'ethereum',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid chain', () => {
      const result = createWalletSchema.safeParse({
        chain: 'invalid',
      });
      expect(result.success).toBe(false);
    });

    it('should default to non-custodial', () => {
      const result = createWalletSchema.safeParse({
        chain: 'ethereum',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('non-custodial');
      }
    });
  });

  describe('createTransactionSchema', () => {
    it('should validate valid transaction', () => {
      const result = createTransactionSchema.safeParse({
        wallet_id: '550e8400-e29b-41d4-a716-446655440000',
        to_address: '0x742d35Cc6634C0532925a3b844Bc9e7595f7c8c',
        amount: '0.5',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid Ethereum address', () => {
      const result = createTransactionSchema.safeParse({
        wallet_id: '550e8400-e29b-41d4-a716-446655440000',
        to_address: 'invalid-address',
        amount: '0.5',
      });
      expect(result.success).toBe(false);
    });

    it('should reject negative amount', () => {
      const result = createTransactionSchema.safeParse({
        wallet_id: '550e8400-e29b-41d4-a716-446655440000',
        to_address: '0x742d35Cc6634C0532925a3b844Bc9e7595f7c8c',
        amount: '-0.5',
      });
      expect(result.success).toBe(false);
    });

    it('should default to transfer type', () => {
      const result = createTransactionSchema.safeParse({
        wallet_id: '550e8400-e29b-41d4-a716-446655440000',
        to_address: '0x742d35Cc6634C0532925a3b844Bc9e7595f7c8c',
        amount: '0.5',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('transfer');
      }
    });
  });
});
