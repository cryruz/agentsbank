-- ============================================
-- Service Role Only RLS Policies
-- Blocks all public/anon access, allows only service_role
-- ============================================

-- Enable RLS on all tables
ALTER TABLE humans ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies
DROP POLICY IF EXISTS service_role_all_humans ON humans;
DROP POLICY IF EXISTS service_role_all_agents ON agents;
DROP POLICY IF EXISTS service_role_all_wallets ON wallets;
DROP POLICY IF EXISTS service_role_all_transactions ON transactions;
DROP POLICY IF EXISTS service_role_all_sessions ON sessions;
DROP POLICY IF EXISTS service_role_all_audit_logs ON audit_logs;

-- Create simple policies: ONLY service_role can access
-- This blocks all anon/authenticated users from internet

CREATE POLICY service_role_all_humans ON humans
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY service_role_all_agents ON agents
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY service_role_all_wallets ON wallets
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY service_role_all_transactions ON transactions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY service_role_all_sessions ON sessions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY service_role_all_audit_logs ON audit_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================
-- RESULT
-- ============================================
-- ✅ Your backend (using service_role key) works normally
-- ❌ Internet users with anon_key CANNOT access any data
-- ❌ Direct database connections BLOCKED
-- ❌ Stolen anon_key is USELESS
