-- Row Level Security (RLS) Policies for AgentsBank.ai
-- Ensures data isolation between agents and humans

-- Humans can only see/edit their own data
CREATE POLICY "Humans view own data"
  ON humans
  FOR SELECT
  USING (human_id = auth.uid());

CREATE POLICY "Humans update own data"
  ON humans
  FOR UPDATE
  USING (human_id = auth.uid());

-- Agents can only see/edit their own data
CREATE POLICY "Agents view own data"
  ON agents
  FOR SELECT
  USING (agent_id = auth.uid());

CREATE POLICY "Agents update own data"
  ON agents
  FOR UPDATE
  USING (agent_id = auth.uid());

-- Wallets: Agents can only see wallets they own
CREATE POLICY "Agents view own wallets"
  ON wallets
  FOR SELECT
  USING (
    agent_id IN (
      SELECT agent_id FROM agents WHERE agent_id = auth.uid()
    )
  );

CREATE POLICY "Agents manage own wallets"
  ON wallets
  FOR ALL
  USING (
    agent_id IN (
      SELECT agent_id FROM agents WHERE agent_id = auth.uid()
    )
  );

-- Transactions: Agents can only see transactions from their wallets
CREATE POLICY "Agents view own transactions"
  ON transactions
  FOR SELECT
  USING (
    wallet_id IN (
      SELECT wallet_id FROM wallets 
      WHERE agent_id IN (
        SELECT agent_id FROM agents WHERE agent_id = auth.uid()
      )
    )
  );

CREATE POLICY "Agents create transactions"
  ON transactions
  FOR INSERT
  WITH CHECK (
    wallet_id IN (
      SELECT wallet_id FROM wallets 
      WHERE agent_id IN (
        SELECT agent_id FROM agents WHERE agent_id = auth.uid()
      )
    )
  );

-- AuditLogs: Users can see logs about their own entities
CREATE POLICY "Agents view own audit logs"
  ON audit_logs
  FOR SELECT
  USING (
    entity_id IN (
      SELECT agent_id FROM agents WHERE agent_id = auth.uid()
    )
    OR
    (entity_type = 'transaction' AND 
     entity_id IN (
       SELECT tx_id FROM transactions 
       WHERE wallet_id IN (
         SELECT wallet_id FROM wallets 
         WHERE agent_id = auth.uid()
       )
     )
    )
  );

-- Sessions: Users can only see their own sessions
CREATE POLICY "Users view own sessions"
  ON sessions
  FOR SELECT
  USING (
    agent_id = auth.uid() 
    OR 
    human_id = auth.uid()
  );

CREATE POLICY "Users revoke own sessions"
  ON sessions
  FOR UPDATE
  USING (
    agent_id = auth.uid() 
    OR 
    human_id = auth.uid()
  )
  WITH CHECK (
    agent_id = auth.uid() 
    OR 
    human_id = auth.uid()
  );

-- Enable RLS on all tables
ALTER TABLE humans ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
