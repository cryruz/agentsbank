-- Add recovery_words_hash column to agents table
-- Run this in Supabase SQL Editor

ALTER TABLE agents 
ADD COLUMN IF NOT EXISTS recovery_words_hash VARCHAR(255);

-- Add comment for documentation
COMMENT ON COLUMN agents.recovery_words_hash IS 'SHA-256 hash of the 33 BIP39 recovery words (space-separated)';
