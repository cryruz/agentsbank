-- Migration: Add detailed fee columns to transactions table
-- Run this on your Supabase database

-- Add new fee breakdown columns
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS chain_fee TEXT DEFAULT '0',
ADD COLUMN IF NOT EXISTS chain_fee_usd TEXT DEFAULT '0',
ADD COLUMN IF NOT EXISTS bank_fee TEXT DEFAULT '0',
ADD COLUMN IF NOT EXISTS bank_fee_usd TEXT DEFAULT '0',
ADD COLUMN IF NOT EXISTS total_fee TEXT DEFAULT '0',
ADD COLUMN IF NOT EXISTS total_fee_usd TEXT DEFAULT '0',
ADD COLUMN IF NOT EXISTS total_deducted TEXT DEFAULT '0',
ADD COLUMN IF NOT EXISTS total_deducted_usd TEXT DEFAULT '0';

-- Add new status values support
-- Note: If using enum, you may need to alter the enum type
-- ALTER TYPE transaction_status ADD VALUE IF NOT EXISTS 'processing';
-- ALTER TYPE transaction_status ADD VALUE IF NOT EXISTS 'rejected';

-- Add comments for documentation
COMMENT ON COLUMN transactions.chain_fee IS 'Network/gas fee in native token';
COMMENT ON COLUMN transactions.chain_fee_usd IS 'Chain fee converted to USD';
COMMENT ON COLUMN transactions.bank_fee IS 'AgentsBank platform fee in transaction currency';
COMMENT ON COLUMN transactions.bank_fee_usd IS 'Bank fee converted to USD';
COMMENT ON COLUMN transactions.total_fee IS 'Total of all fees';
COMMENT ON COLUMN transactions.total_fee_usd IS 'Total fees in USD';
COMMENT ON COLUMN transactions.total_deducted IS 'amount + total_fee (what leaves wallet)';
COMMENT ON COLUMN transactions.total_deducted_usd IS 'Total deducted converted to USD';

-- Create index for efficient quota queries
CREATE INDEX IF NOT EXISTS idx_transactions_wallet_status_timestamp 
ON transactions(wallet_id, status, timestamp);

-- Create index for agent-level quota queries (via wallet)
CREATE INDEX IF NOT EXISTS idx_transactions_timestamp 
ON transactions(timestamp);
