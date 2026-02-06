-- Add encrypted_private_key column for secure key storage
-- This column stores AES-256-GCM encrypted private keys
-- Run this migration: psql -d your_database -f add-encrypted-key-column.sql

-- Add the encrypted_private_key column to wallets table
ALTER TABLE wallets 
ADD COLUMN IF NOT EXISTS encrypted_private_key TEXT;

-- Add comment for documentation
COMMENT ON COLUMN wallets.encrypted_private_key IS 'AES-256-GCM encrypted private key - NEVER expose to agents';

-- The private_key_hash column is now used for integrity verification only
COMMENT ON COLUMN wallets.private_key_hash IS 'SHA-256 hash of private key for integrity verification';
