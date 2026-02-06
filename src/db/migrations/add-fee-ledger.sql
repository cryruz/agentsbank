-- Fee Ledger: Tracks accumulated platform fees for efficient batch collection
-- Fees accumulate per wallet until sweep threshold is reached

-- Fee ledger entries
CREATE TABLE IF NOT EXISTS fee_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Source wallet that owes the fee
  wallet_id UUID NOT NULL REFERENCES wallets(wallet_id),
  agent_id UUID NOT NULL REFERENCES agents(agent_id),
  
  -- Fee details
  chain TEXT NOT NULL,
  currency TEXT NOT NULL,           -- Currency the fee is denominated in (same as tx)
  fee_amount TEXT NOT NULL,         -- Fee amount in currency
  fee_amount_usd TEXT NOT NULL,     -- Fee amount in USD (for threshold checking)
  
  -- Reference to original transaction
  transaction_id UUID REFERENCES transactions(tx_id),
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, collected, written_off
  
  -- Collection details (filled when swept)
  collected_at TIMESTAMPTZ,
  collection_tx_hash TEXT,
  collection_batch_id UUID,         -- Groups multiple fees into one sweep
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fee collection batches (one sweep = one batch)
CREATE TABLE IF NOT EXISTS fee_collection_batches (
  batch_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Collection details
  chain TEXT NOT NULL,
  currency TEXT NOT NULL,
  total_fees TEXT NOT NULL,          -- Total fees in this batch
  total_fees_usd TEXT NOT NULL,      -- Total fees in USD
  fee_count INTEGER NOT NULL,        -- Number of individual fees in batch
  
  -- Treasury destination
  treasury_address TEXT NOT NULL,
  
  -- Execution
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, processing, completed, failed
  tx_hash TEXT,
  gas_used TEXT,
  gas_cost_usd TEXT,
  
  -- Profitability
  net_collected_usd TEXT,            -- total_fees_usd - gas_cost_usd
  
  -- Error tracking
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_fee_ledger_wallet ON fee_ledger(wallet_id);
CREATE INDEX IF NOT EXISTS idx_fee_ledger_status ON fee_ledger(status);
CREATE INDEX IF NOT EXISTS idx_fee_ledger_chain_status ON fee_ledger(chain, status);
CREATE INDEX IF NOT EXISTS idx_fee_ledger_created ON fee_ledger(created_at);
CREATE INDEX IF NOT EXISTS idx_fee_collection_batches_status ON fee_collection_batches(status);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_fee_ledger_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER fee_ledger_updated_at
  BEFORE UPDATE ON fee_ledger
  FOR EACH ROW
  EXECUTE FUNCTION update_fee_ledger_timestamp();

-- View: Accumulated fees ready for collection per chain
CREATE OR REPLACE VIEW pending_fees_by_chain AS
SELECT 
  chain,
  currency,
  COUNT(*) as fee_count,
  SUM(CAST(fee_amount AS DECIMAL)) as total_fees,
  SUM(CAST(fee_amount_usd AS DECIMAL)) as total_fees_usd,
  MIN(created_at) as oldest_fee_at
FROM fee_ledger
WHERE status = 'pending'
GROUP BY chain, currency;

-- View: Fee collection summary
CREATE OR REPLACE VIEW fee_collection_summary AS
SELECT 
  chain,
  DATE_TRUNC('day', created_at) as date,
  SUM(CAST(total_fees_usd AS DECIMAL)) as collected_usd,
  SUM(CAST(gas_cost_usd AS DECIMAL)) as gas_spent_usd,
  SUM(CAST(net_collected_usd AS DECIMAL)) as net_usd,
  COUNT(*) as batch_count,
  SUM(fee_count) as total_fees_collected
FROM fee_collection_batches
WHERE status = 'completed'
GROUP BY chain, DATE_TRUNC('day', created_at)
ORDER BY date DESC;
