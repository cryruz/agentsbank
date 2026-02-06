import { z } from 'zod';

// Auth validators
export const registerHumanSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(50, 'Username must not exceed 50 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain alphanumeric, underscore, and hyphen'),
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain uppercase letter')
    .regex(/[0-9]/, 'Password must contain number')
    .regex(/[^a-zA-Z0-9]/, 'Password must contain special character'),
});

export const loginSchema = z.object({
  username: z.string().min(1, 'Username required'),
  password: z.string().min(1, 'Password required'),
});

export const createAgentSchema = z.object({
  first_name: z
    .string()
    .min(1, 'First name required')
    .max(100, 'First name too long'),
  last_name: z
    .string()
    .min(1, 'Last name required')
    .max(100, 'Last name too long'),
  agent_password: z
    .string()
    .min(8, 'Agent password must be at least 8 characters'),
});

export const agentLoginSchema = z.object({
  agent_username: z.string().min(1, 'Agent username required'),
  agent_password: z.string().min(1, 'Password required'),
});

// Wallet validators
export const createWalletSchema = z.object({
  chain: z
    .enum(['ethereum', 'bsc', 'solana', 'bitcoin'], {
      errorMap: () => ({ message: 'Invalid chain. Supported: ethereum, bsc, solana, bitcoin' }),
    }),
  type: z
    .enum(['custodial', 'non-custodial'], {
      errorMap: () => ({ message: 'Invalid wallet type' }),
    })
    .optional()
    .default('non-custodial'),
});

// Transaction validators
export const createTransactionSchema = z.object({
  wallet_id: z.string().uuid('Invalid wallet ID'),
  to_address: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  amount: z
    .string()
    .regex(/^\d+(\.\d+)?$/, 'Invalid amount format')
    .transform((v: string) => parseFloat(v))
    .refine((v: number) => v > 0, 'Amount must be greater than 0'),
  currency: z
    .string()
    .max(10, 'Currency too long')
    .optional()
    .default('ETH')
    .refine(
      (currency) => ['ETH', 'BNB', 'SOL', 'BTC', 'USDT', 'USDC'].includes(currency),
      'Currency must be one of: ETH, BNB, SOL, BTC, USDT, USDC'
    ),
  type: z
    .enum(['transfer', 'swap', 'stake', 'unstake', 'deposit', 'withdraw'], {
      errorMap: () => ({ message: 'Invalid transaction type' }),
    })
    .optional()
    .default('transfer'),
});

// Guardrails validators
export const guardrailsSchema = z.object({
  max_daily_spend: z
    .string()
    .regex(/^\d+(\.\d+)?$/, 'Invalid format')
    .optional(),
  max_transaction_amount: z
    .string()
    .regex(/^\d+(\.\d+)?$/, 'Invalid format')
    .optional(),
  whitelist_addresses: z
    .array(z.string().regex(/^0x[a-fA-F0-9]{40}$/))
    .optional(),
  blacklist_addresses: z
    .array(z.string().regex(/^0x[a-fA-F0-9]{40}$/))
    .optional(),
});

export const updateGuardrailsSchema = z.object({
  guardrails: guardrailsSchema,
});

// Type exports for runtime validation
export type RegisterHumanInput = z.infer<typeof registerHumanSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateAgentInput = z.infer<typeof createAgentSchema>;
export type AgentLoginInput = z.infer<typeof agentLoginSchema>;
export type CreateWalletInput = z.infer<typeof createWalletSchema>;
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type GuardrailsInput = z.infer<typeof guardrailsSchema>;
export type UpdateGuardrailsInput = z.infer<typeof updateGuardrailsSchema>;
