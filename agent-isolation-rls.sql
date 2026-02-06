-- ============================================
-- AgentsBank RLS Policies - Agent Isolation
-- Agents on random PCs can only access their own data
-- Backend uses service_role, agents use anon key
-- ============================================

-- Enable RLS on all tables
ALTER TABLE humans ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS service_role_all_humans ON humans;
DROP POLICY IF EXISTS service_role_all_agents ON agents;
DROP POLICY IF EXISTS service_role_all_wallets ON wallets;
DROP POLICY IF EXISTS service_role_all_transactions ON transactions;
DROP POLICY IF EXISTS service_role_all_sessions ON sessions;
DROP POLICY IF EXISTS service_role_all_audit_logs ON audit_logs;
DROP POLICY IF EXISTS agents_own_data ON agents;
DROP POLICY IF EXISTS agents_insert ON agents;
DROP POLICY IF EXISTS agents_update ON agents;
DROP POLICY IF EXISTS wallets_own_data ON wallets;
DROP POLICY IF EXISTS wallets_insert ON wallets;
DROP POLICY IF EXISTS wallets_update ON wallets;
DROP POLICY IF EXISTS transactions_own_data ON transactions;
DROP POLICY IF EXISTS transactions_insert ON transactions;
DROP POLICY IF EXISTS transactions_update ON transactions;
DROP POLICY IF EXISTS audit_logs_insert ON audit_logs;
DROP POLICY IF EXISTS audit_logs_read ON audit_logs;
DROP POLICY IF EXISTS sessions_own_data ON sessions;

-- ============================================
-- HUMANS TABLE
-- Service role only (backend operations)
-- ============================================

CREATE POLICY humans_service_role ON humans
  FOR ALL
  USING (true);

-- ============================================
-- AGENTS TABLE
-- Agents can read their own data
-- Backend creates/updates agents
-- ============================================

CREATE POLICY agents_read_own ON agents
  FOR SELECT
  USING (
    agent_id::text = current_setting('request.jwt.claims', true)::json->>'sub'
  );

CREATE POLICY agents_backend_modify ON agents
  FOR ALL
  USING (true);

-- ============================================
-- WALLETS TABLE
-- Agents can only access their own wallets
-- ============================================

CREATE POLICY wallets_own_data ON wallets
  FOR SELECT
  USING (
    agent_id::text = current_setting('request.jwt.claims', true)::json->>'sub'
  );

CREATE POLICY wallets_own_insert ON wallets
  FOR INSERT
  WITH CHECK (
    agent_id::text = current_setting('request.jwt.claims', true)::json->>'sub'
  );

CREATE POLICY wallets_own_update ON wallets
  FOR UPDATE
  USING (
    agent_id::text = current_setting('request.jwt.claims', true)::json->>'sub'
  );

CREATE POLICY wallets_backend_access ON wallets
  FOR ALL
  USING (true);

-- ============================================
-- TRANSACTIONS TABLE  
-- Agents can only access transactions from their wallets
-- ============================================

CREATE POLICY transactions_own_data ON transactions
  FOR SELECT
  USING (
    wallet_id IN (
      SELECT wallet_id FROM wallets 
      WHERE agent_id::text = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );

CREATE POLICY transactions_own_insert ON transactions
  FOR INSERT
  WITH CHECK (
    wallet_id IN (
      SELECT wallet_id FROM wallets 
      WHERE agent_id::text = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );

CREATE POLICY transactions_own_update ON transactions
  FOR UPDATE
  USING (
    wallet_id IN (
      SELECT wallet_id FROM wallets 
      WHERE agent_id::text = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );

CREATE POLICY transactions_backend_access ON transactions
  FOR ALL
  USING (true);

-- ============================================
-- AUDIT LOGS
-- Agents can read their own logs
-- Everyone can insert
-- ============================================

CREATE POLICY audit_logs_insert_all ON audit_logs
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY audit_logs_read_own ON audit_logs
  FOR SELECT
  USING (
    entity_id::text = current_setting('request.jwt.claims', true)::json->>'sub'
  );

CREATE POLICY audit_logs_backend_access ON audit_logs
  FOR ALL
  USING (true);

-- ============================================
-- SESSIONS
-- Users can only see their own sessions
-- ============================================

CREATE POLICY sessions_own_data ON sessions
  FOR ALL
  USING (
    human_id::text = current_setting('request.jwt.claims', true)::json->>'sub'
    OR agent_id::text = current_setting('request.jwt.claims', true)::json->>'sub'
  );

CREATE POLICY sessions_backend_access ON sessions
  FOR ALL
  USING (true);

-- ============================================
-- SET DEFAULT ROLE FOR POLICIES
-- ============================================

-- Backend policies apply to service_role
ALTER POLICY humans_service_role ON humans TO service_role;
ALTER POLICY agents_backend_modify ON agents TO service_role;
ALTER POLICY wallets_backend_access ON wallets TO service_role;
ALTER POLICY transactions_backend_access ON transactions TO service_role;
ALTER POLICY audit_logs_backend_access ON audit_logs TO service_role;
ALTER POLICY sessions_backend_access ON sessions TO service_role;

-- Agent policies apply to anon (authenticated users from internet)
ALTER POLICY agents_read_own ON agents TO anon, authenticated;
ALTER POLICY wallets_own_data ON wallets TO anon, authenticated;
ALTER POLICY wallets_own_insert ON wallets TO anon, authenticated;
ALTER POLICY wallets_own_update ON wallets TO anon, authenticated;
ALTER POLICY transactions_own_data ON transactions TO anon, authenticated;
ALTER POLICY transactions_own_insert ON transactions TO anon, authenticated;
ALTER POLICY transactions_own_update ON transactions TO anon, authenticated;
ALTER POLICY audit_logs_insert_all ON audit_logs TO anon, authenticated;
ALTER POLICY audit_logs_read_own ON audit_logs TO anon, authenticated;
ALTER POLICY sessions_own_data ON sessions TO anon, authenticated;

-- ============================================
-- GRANT PERMISSIONS
-- ============================================

GRANT SELECT, INSERT ON agents TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON wallets TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON transactions TO anon, authenticated;
GRANT INSERT ON audit_logs TO anon, authenticated;
GRANT SELECT ON audit_logs TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON sessions TO anon, authenticated;

-- ============================================
-- NOTES
-- ============================================
-- This setup requires JWT tokens to contain 'sub' claim
-- Backend must set JWT claim before queries:
--   SET LOCAL request.jwt.claims = '{"sub": "agent-id"}';
