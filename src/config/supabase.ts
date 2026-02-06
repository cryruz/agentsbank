import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger.js';

// Load env vars immediately
config();

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY in environment');
}

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Service role client for admin operations
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

export async function initSupabase() {
  try {
    const { error } = await supabase.auth.getSession();
    if (error) throw error;
    logger.info('✓ Supabase connected');
  } catch (error) {
    logger.error('Failed to initialize Supabase:', error);
    process.exit(1);
  }
}

// Type definitions for database tables
export type Human = {
  human_id: string;
  username: string;
  password_hash: string;
  email: string;
  created_at: string;
  last_login: string | null;
  mfa_enabled: boolean;
};

export type Agent = {
  agent_id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  human_id: string;
  agent_username: string;
  agent_password_hash: string;
  did: string | null;
  reputation_score: number;
  status: 'active' | 'suspended' | 'archived';
  created_at: string;
  guardrails: Record<string, unknown>;
  api_key: string;
};

export type Wallet = {
  wallet_id: string;
  agent_id: string;
  chain: string;
  address: string;
  encrypted_private_key?: string;  // AES-256-GCM encrypted - NEVER expose to agents
  private_key_hash: string | null; // SHA-256 hash for integrity verification
  balance: Record<string, string>;
  type: 'custodial' | 'non-custodial';
  created_at: string;
};

export type Transaction = {
  tx_id: string;
  wallet_id: string;
  type: string;
  amount: string;                    // Amount being sent
  currency: string;
  from_address: string;
  to_address: string;
  tx_hash: string | null;
  status: 'pending' | 'processing' | 'confirmed' | 'failed' | 'rejected';
  
  // Fee breakdown
  chain_fee: string;                 // Network/gas fee in native token
  chain_fee_usd: string;             // Chain fee in USD
  bank_fee: string;                  // AgentsBank platform fee in transaction currency
  bank_fee_usd: string;              // Bank fee in USD
  total_fee: string;                 // Total fees in transaction currency
  total_fee_usd: string;             // Total fees in USD
  
  // Totals
  total_deducted: string;            // amount + total_fee (what leaves wallet)
  total_deducted_usd: string;        // Total in USD
  
  // Legacy field for compatibility
  fee: string;
  
  timestamp: string;
  metadata: Record<string, unknown>;
};

// Detailed fee calculation result
export type FeeCalculation = {
  amount: string;
  amount_usd: string;
  currency: string;
  chain: string;
  
  // Chain fees
  chain_fee: string;
  chain_fee_currency: string;
  chain_fee_usd: string;
  
  // Bank fees
  bank_fee: string;
  bank_fee_currency: string;
  bank_fee_usd: string;
  bank_fee_percentage: number;
  bank_fee_tier: string;
  
  // Totals
  total_fee_usd: string;
  total_deducted: string;
  total_deducted_usd: string;
  
  // Exchange rates used
  exchange_rates: Record<string, number>;
};

// Quota status for an agent
export type QuotaStatus = {
  agent_id: string;
  
  // Daily
  daily_transaction_count: number;
  daily_volume_usd: number;
  daily_limit_remaining_usd: number;
  
  // Monthly
  monthly_transaction_count: number;
  monthly_volume_usd: number;
  monthly_limit_remaining_usd: number;
  
  // Current tier
  fee_tier: string;
  fee_percentage: number;
  
  // Limits
  max_transaction_usd: number;
  can_transact: boolean;
  rejection_reason?: string;
};

export type AuditLog = {
  log_id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor: string;
  actor_type: 'human' | 'agent';
  details: Record<string, unknown>;
  ip_address: string | null;
  timestamp: string;
};

export type Session = {
  session_id: string;
  human_id: string | null;
  agent_id: string | null;
  token_hash: string;
  ip: string;
  user_agent: string;
  expires_at: string;
  revoked: boolean;
  created_at: string;
};
