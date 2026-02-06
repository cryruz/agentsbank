-- AgentsBank.ai Base Tables Migration
-- Created: 2025-02-06
-- Database: PostgreSQL (Supabase)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Humans table
CREATE TABLE IF NOT EXISTS humans (
  human_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  mfa_enabled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login TIMESTAMP WITH TIME ZONE,
  CONSTRAINT valid_email CHECK (email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$')
);

-- Agents table
CREATE TABLE IF NOT EXISTS agents (
  agent_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  date_of_birth TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  human_id UUID NOT NULL REFERENCES humans(human_id) ON DELETE CASCADE,
  agent_username VARCHAR(255) UNIQUE NOT NULL,
  agent_password_hash VARCHAR(255) NOT NULL,
  did VARCHAR(255), -- Decentralized Identifier
  reputation_score FLOAT DEFAULT 1.0,
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  guardrails JSONB DEFAULT '{"max_transaction_amount": "1000", "daily_spend_limit": "5000", "monthly_spend_limit": "50000"}',
  api_key VARCHAR(255) UNIQUE,
  recovery_words_hash VARCHAR(255), -- SHA256 hash of recovery words
  CONSTRAINT valid_status CHECK (status IN ('active', 'suspended', 'archived'))
);

-- Wallets table
CREATE TABLE IF NOT EXISTS wallets (
  wallet_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
  chain VARCHAR(50) NOT NULL CHECK (chain IN ('ethereum', 'bsc', 'solana', 'bitcoin')),
  address VARCHAR(255) NOT NULL,
  private_key_hash VARCHAR(255), -- Reference to encrypted key in Vault
  balance JSONB DEFAULT '{}', -- { "ETH": "1.5", "USDT": "100", ... }
  type VARCHAR(50) DEFAULT 'non-custodial' CHECK (type IN ('custodial', 'non-custodial')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(agent_id, chain, address)
);

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
  tx_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_id UUID NOT NULL REFERENCES wallets(wallet_id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL CHECK (type IN ('deposit', 'transfer', 'swap', 'stake', 'unstake', 'withdraw')),
  amount DECIMAL(30, 8) NOT NULL,
  currency VARCHAR(20) NOT NULL, -- ETH, USDT, USDC, BNB, SOL, BTC
  from_address VARCHAR(255) NOT NULL,
  to_address VARCHAR(255) NOT NULL,
  tx_hash VARCHAR(255),
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed')),
  fee DECIMAL(30, 8) DEFAULT 0,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB DEFAULT '{}', -- { "gas_price": "...", "nonce": "...", ... }
  CONSTRAINT valid_amount CHECK (amount > 0)
);

-- AuditLogs table
CREATE TABLE IF NOT EXISTS audit_logs (
  log_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID,
  action VARCHAR(255) NOT NULL,
  actor VARCHAR(255) NOT NULL,
  actor_type VARCHAR(20) NOT NULL CHECK (actor_type IN ('human', 'agent', 'system')),
  details JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  session_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  human_id UUID REFERENCES humans(human_id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agents(agent_id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL,
  ip_address INET,
  user_agent TEXT,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  revoked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT at_least_one_user CHECK (human_id IS NOT NULL OR agent_id IS NOT NULL)
);

-- Create indexes for performance
CREATE INDEX idx_agents_human_id ON agents(human_id);
CREATE INDEX idx_agents_username ON agents(agent_username);
CREATE INDEX idx_wallets_agent_id ON wallets(agent_id);
CREATE INDEX idx_wallets_chain ON wallets(chain);
CREATE INDEX idx_transactions_wallet_id ON transactions(wallet_id);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_timestamp ON transactions(timestamp DESC);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX idx_sessions_agent_id ON sessions(agent_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- Grants (for Supabase)
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, authenticated, anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, authenticated, anon;
