-- AgentsBank.ai Database Schema
-- Run this in your Supabase SQL Editor

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create humans table
CREATE TABLE IF NOT EXISTS humans (
  human_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP WITH TIME ZONE,
  mfa_enabled BOOLEAN DEFAULT FALSE
);

-- Create agents table
CREATE TABLE IF NOT EXISTS agents (
  agent_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  human_id UUID NOT NULL REFERENCES humans(human_id) ON DELETE CASCADE,
  first_name VARCHAR(255) NOT NULL,
  last_name VARCHAR(255) NOT NULL,
  date_of_birth TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  agent_username VARCHAR(255) UNIQUE NOT NULL,
  agent_password_hash VARCHAR(255) NOT NULL,
  did VARCHAR(255) UNIQUE,
  reputation_score FLOAT DEFAULT 0,
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived')),
  guardrails JSONB DEFAULT '{"max_daily_spend": "1000", "max_transaction_amount": "100"}',
  api_key UUID UNIQUE NOT NULL,
  recovery_words_hash VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create wallets table
CREATE TABLE IF NOT EXISTS wallets (
  wallet_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
  chain VARCHAR(50) NOT NULL,
  address VARCHAR(255) NOT NULL,
  private_key_hash VARCHAR(255),
  balance JSONB DEFAULT '{"native": "0"}',
  type VARCHAR(50) NOT NULL DEFAULT 'non-custodial' CHECK (type IN ('custodial', 'non-custodial')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create transactions table
CREATE TABLE IF NOT EXISTS transactions (
  tx_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_id UUID NOT NULL REFERENCES wallets(wallet_id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  amount VARCHAR(255) NOT NULL,
  currency VARCHAR(50) DEFAULT 'ETH',
  from_address VARCHAR(255) NOT NULL,
  to_address VARCHAR(255) NOT NULL,
  tx_hash VARCHAR(255),
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed')),
  fee VARCHAR(255) DEFAULT '0',
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB DEFAULT '{}'
);

-- Create sessions table
CREATE TABLE IF NOT EXISTS sessions (
  session_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  human_id UUID REFERENCES humans(human_id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agents(agent_id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL,
  ip VARCHAR(45),
  user_agent TEXT,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  revoked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  log_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  action VARCHAR(100) NOT NULL,
  actor VARCHAR(255) NOT NULL,
  actor_type VARCHAR(50) NOT NULL CHECK (actor_type IN ('human', 'agent')),
  details JSONB DEFAULT '{}',
  ip_address VARCHAR(45),
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_agents_human_id ON agents(human_id);
CREATE INDEX idx_agents_status ON agents(status);
CREATE INDEX idx_agents_api_key ON agents(api_key);
CREATE INDEX idx_wallets_agent_id ON wallets(agent_id);
CREATE INDEX idx_wallets_chain ON wallets(chain);
CREATE INDEX idx_transactions_wallet_id ON transactions(wallet_id);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_timestamp ON transactions(timestamp);
CREATE INDEX idx_sessions_human_id ON sessions(human_id);
CREATE INDEX idx_sessions_agent_id ON sessions(agent_id);
CREATE INDEX idx_audit_logs_entity_id ON audit_logs(entity_id);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);

-- Enable Row-Level Security (RLS) for multi-tenancy
ALTER TABLE humans ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for agents (agent can only see their own data)
CREATE POLICY agents_isolation ON agents
  FOR SELECT
  USING (
    auth.uid()::text = agent_id::text OR
    auth.uid()::text = human_id::text
  );

CREATE POLICY wallets_isolation ON wallets
  FOR SELECT
  USING (
    auth.uid()::text = (SELECT agent_id FROM agents WHERE agent_id = wallets.agent_id)::text
  );

CREATE POLICY transactions_isolation ON transactions
  FOR SELECT
  USING (
    auth.uid()::text = (SELECT agent_id FROM wallets WHERE wallet_id = transactions.wallet_id)::text
  );

-- Grant appropriate permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
