import crypto from 'crypto';
import { logger } from './logger.js';

/**
 * Secure encryption for private keys using AES-256-GCM
 * In production, MASTER_ENCRYPTION_KEY should come from:
 * - AWS KMS
 * - HashiCorp Vault
 * - Azure Key Vault
 * - Google Cloud KMS
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;

// Master key for encrypting private keys (32 bytes for AES-256)
function getMasterKey(): Buffer {
  const key = process.env.MASTER_ENCRYPTION_KEY;
  if (!key) {
    // In development, derive from a default (NOT FOR PRODUCTION)
    logger.warn('MASTER_ENCRYPTION_KEY not set - using derived key (NOT FOR PRODUCTION)');
    return crypto.scryptSync('dev-master-key-change-in-production', 'salt', 32);
  }
  // If key is hex-encoded (64 chars = 32 bytes)
  if (key.length === 64) {
    return Buffer.from(key, 'hex');
  }
  // Otherwise derive from the string
  return crypto.scryptSync(key, 'agentsbank-salt', 32);
}

/**
 * Encrypt a private key for secure storage
 * Returns: base64 encoded string containing: salt + iv + authTag + encrypted data
 */
export function encryptPrivateKey(privateKey: string): string {
  const masterKey = getMasterKey();
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  
  // Derive a unique key for this encryption using salt
  const derivedKey = crypto.scryptSync(masterKey, salt, 32);
  
  const cipher = crypto.createCipheriv(ALGORITHM, derivedKey, iv);
  
  let encrypted = cipher.update(privateKey, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  
  const authTag = cipher.getAuthTag();
  
  // Combine: salt + iv + authTag + encrypted
  const combined = Buffer.concat([salt, iv, authTag, encrypted]);
  
  return combined.toString('base64');
}

/**
 * Decrypt a private key from storage
 * Input: base64 encoded string from encryptPrivateKey
 */
export function decryptPrivateKey(encryptedData: string): string {
  const masterKey = getMasterKey();
  const combined = Buffer.from(encryptedData, 'base64');
  
  // Extract components
  const salt = combined.subarray(0, SALT_LENGTH);
  const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const authTag = combined.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = combined.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);
  
  // Derive the same key using the salt
  const derivedKey = crypto.scryptSync(masterKey, salt, 32);
  
  const decipher = crypto.createDecipheriv(ALGORITHM, derivedKey, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  
  return decrypted.toString('utf8');
}

/**
 * Generate a fingerprint/hash of a private key for verification
 * This is safe to store alongside encrypted key for integrity checks
 */
export function hashPrivateKey(privateKey: string): string {
  return crypto.createHash('sha256').update(privateKey).digest('hex');
}

/**
 * Verify encrypted key matches expected hash
 */
export function verifyPrivateKey(encryptedData: string, expectedHash: string): boolean {
  try {
    const decrypted = decryptPrivateKey(encryptedData);
    const actualHash = hashPrivateKey(decrypted);
    return actualHash === expectedHash;
  } catch {
    return false;
  }
}
