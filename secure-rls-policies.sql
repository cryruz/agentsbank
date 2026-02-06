-- ============================================
-- AgentsBank Secure RLS Policies
-- Principle: Agents can only access their own data
-- ============================================

-- First, re-enable RLS on all tables
ALTER TABLE humans ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS agents_isolation ON agents;
DROP POLICY IF EXISTS wallets_isolation ON wallets;
DROP POLICY IF EXISTS transactions_isolation ON transactions;
DROP POLICY IF EXISTS humans_own_data ON humans;
DROP POLICY IF EXISTS agents_own_data ON agents;
DROP POLICY IF EXISTS agents_insert ON agents;
DROP POLICY IF EXISTS wallets_own_data ON wallets;
DROP POLICY IF EXISTS wallets_insert ON wallets;
DROP POLICY IF EXISTS transactions_own_data ON transactions;
DROP POLICY IF EXISTS transactions_insert ON transactions;
DROP POLICY IF EXISTS audit_logs_insert ON audit_logs;
DROP POLICY IF EXISTS audit_logs_read ON audit_logs;

-- ============================================
-- HUMANS TABLE POLICIES
-- ============================================

-- Humans can read/update their own data
-- Service role can do everything (for registration)
CREATE POLICY humans_own_data ON humans
  FOR ALL
  USING (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
    OR human_id::text = current_setting('request.jwt.claims', true)::json->>'sub'
  );

-- ============================================
-- AGENTS TABLE POLICIES
-- ============================================

-- Agents can read their own data
-- Humans can read/update their agents
CREATE POLICY agents_own_data ON agents
  FOR SELECT
  USING (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
    OR agent_id::text = current_setting('request.jwt.claims', true)::json->>'sub'
    OR human_id::text = current_setting('request.jwt.claims', true)::json->>'sub'
  );

-- Humans can create agents
-- Service role can insert (for agent registration)
CREATE POLICY agents_insert ON agents
  FOR INSERT
  WITH CHECK (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
    OR human_id::text = current_setting('request.jwt.claims', true)::json->>'sub'
  );

-- Humans can update their agents (guardrails, status)
CREATE POLICY agents_update ON agents
  FOR UPDATE
  USING (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
    OR human_id::text = current_setting('request.jwt.claims', true)::json->>'sub'
  );

-- ============================================
-- WALLETS TABLE POLICIES
-- ============================================

-- Agents can only see their own wallets
CREATE POLICY wallets_own_data ON wallets
  FOR SELECT
  USING (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
    OR agent_id::text = current_setting('request.jwt.claims', true)::json->>'sub'
  );

-- Agents can create their own wallets
CREATE POLICY wallets_insert ON wallets
  FOR INSERT
  WITH CHECK (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
    OR agent_id::text = current_setting('request.jwt.claims', true)::json->>'sub'
  );

-- Agents can update their own wallet balances
CREATE POLICY wallets_update ON wallets
  FOR UPDATE
  USING (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
    OR agent_id::text = current_setting('request.jwt.claims', true)::json->>'sub'
  );

-- ============================================
-- TRANSACTIONS TABLE POLICIES
-- ============================================

-- Agents can only see transactions from their own wallets
CREATE POLICY transactions_own_data ON transactions
  FOR SELECT
  USING (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
    OR wallet_id IN (
      SELECT wallet_id FROM wallets 
      WHERE agent_id::text = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );

-- Agents can create transactions for their own wallets
CREATE POLICY transactions_insert ON transactions
  FOR INSERT
  WITH CHECK (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
    OR wallet_id IN (
      SELECT wallet_id FROM wallets 
      WHERE agent_id::text = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );

-- Agents/System can update transaction status
CREATE POLICY transactions_update ON transactions
  FOR UPDATE
  USING (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
    OR wallet_id IN (
      SELECT wallet_id FROM wallets 
      WHERE agent_id::text = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );

-- ============================================
-- AUDIT LOGS POLICIES
-- ============================================

-- Anyone authenticated can insert audit logs
-- Service role can do everything
CREATE POLICY audit_logs_insert ON audit_logs
  FOR INSERT
  WITH CHECK (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
    OR current_setting('request.jwt.claims', true)::json->>'sub' IS NOT NULL
  );

-- Agents can only read their own audit logs
-- Humans can read logs for their agents
CREATE POLICY audit_logs_read ON audit_logs
  FOR SELECT
  USING (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
    OR entity_id::text = current_setting('request.jwt.claims', true)::json->>'sub'
    OR entity_id IN (
      SELECT agent_id::text FROM agents 
      WHERE human_id::text = current_setting('request.jwt.claims', true)::json->>'sub'
    )
  );

-- ============================================
-- SESSIONS TABLE POLICIES
-- ============================================

-- Users can only see their own sessions
CREATE POLICY sessions_own_data ON sessions
  FOR ALL
  USING (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
    OR human_id::text = current_setting('request.jwt.claims', true)::json->>'sub'
    OR agent_id::text = current_setting('request.jwt.claims', true)::json->>'sub'
  );

-- ============================================
-- GRANT PERMISSIONS
-- ============================================

-- Grant authenticated users access to tables
GRANT SELECT, INSERT, UPDATE ON humans TO authenticated;
GRANT SELECT, INSERT, UPDATE ON agents TO authenticated;
GRANT SELECT, INSERT, UPDATE ON wallets TO authenticated;
GRANT SELECT, INSERT, UPDATE ON transactions TO authenticated;
GRANT SELECT, INSERT ON audit_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON sessions TO authenticated;

-- Grant service role full access
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- ============================================
-- NOTES
-- ============================================

-- IMPORTANT: This policy assumes JWT tokens contain:
-- - 'sub': user/agent ID
-- - 'role': 'service_role' for backend operations
--
-- The application uses custom JWT (not Supabase Auth), so we rely on
-- current_setting('request.jwt.claims') populated by the backend.
--
-- For full security:
-- 1. Backend must set JWT claims in connection string or request headers
-- 2. Use service_role key for all operations that bypass RLS
-- 3. Validate agent ownership before operations in application code
