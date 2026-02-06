# AgentsBank - Security & Data Isolation

## Overview

AgentsBank implements multi-layer security to ensure:
- ✅ Admin keys/secrets never reach client SDKs
- ✅ Agents can ONLY access their own wallets & transactions
- ✅ Server-side key management & signing (private keys never exposed)
- ✅ BIP39 recovery words for account recovery
- ✅ Role-based access control (RBAC) via JWT & API Keys

---

## Authentication & Authorization

### 1. Authentication Methods

#### JWT Tokens (Short-lived)
```typescript
// Registration returns JWT token
const { token, agent } = await client.registerAgent({
  human_email: 'dev@example.com',
  agent_password: 'SecurePass123!'
});

// Token valid for: ~7 days (configurable)
// Use: Authorization: Bearer <token>
client.setToken(token);
```

#### API Keys (Long-lived)
```typescript
// Every agent gets an API key upon registration
const apiKey = agent.api_key; // UUID format

// Use: X-API-Key: <api_key>
client.setApiKey(apiKey);

// Regenerate if compromised
const newKey = await client.regenerateApiKey();
```

### 2. Authorization Enforcement

Every endpoint checks that the authenticated agent owns the resource:

#### Wallet Ownership Check
```typescript
// src/routes/wallets.ts
walletRouter.get('/:walletId', authMiddleware, async (req, res) => {
  const wallet = await WalletService.getWallet(req.params.walletId);
  
  // ⚠️ CRITICAL: Only owner can access
  if (req.agent?.sub !== wallet.agent_id) {
    return res.status(403).json({ error: 'Not authorized' });
  }
  
  res.json(wallet);
});
```

#### Transaction Signing (Only Owner Can Sign)
```typescript
// src/routes/wallets.ts
walletRouter.post('/:walletId/send', authMiddleware, requireAgent, async (req, res) => {
  const wallet = await WalletService.getWallet(req.params.walletId);
  
  // ⚠️ CRITICAL: Verify agent owns wallet
  if (req.agent?.sub !== wallet.agent_id) {
    return res.status(403).json({ error: 'Not authorized to send' });
  }
  
  // Server-side signing (agent never sees private key)
  const txHash = await WalletService.signAndSendTransaction(...);
  res.json({ tx_hash: txHash });
});
```

---

## Key Management

### 1. Private Key Storage

**Location:** PostgreSQL database with encryption
```sql
-- wallets table
wallet_id         UUID PRIMARY KEY
agent_id          UUID (Foreign Key → agents)
encrypted_private_key  BYTEA  -- AES-256-GCM encrypted
private_key_hash  VARCHAR    -- SHA-256 for integrity check
chain             VARCHAR
address           VARCHAR
```

**Encryption:**
```typescript
// src/utils/crypto.ts
const encryptedKey = AES256GCM.encrypt(
  privateKey,
  ENCRYPTION_SECRET  // From .env, never in SDK
);
```

### 2. Private Key Access

**Only Server Can Access:**
```typescript
// src/services/wallet.ts
static async signAndSendTransaction(walletId, toAddress, amount, chain) {
  // 1. Fetch encrypted key from DB
  const wallet = await supabaseAdmin
    .from('wallets')
    .select('encrypted_private_key')
    .eq('wallet_id', walletId)
    .single();
  
  // 2. Decrypt locally (in secure server environment)
  const privateKey = AES256GCM.decrypt(
    wallet.encrypted_private_key,
    ENCRYPTION_SECRET
  );
  
  // 3. Sign transaction
  const tx = signTransaction(privateKey, toAddress, amount);
  
  // 4. Broadcast to blockchain
  await broadcastTransaction(tx, chain);
  
  // 5. Return only hash (never expose private key)
  return { tx_hash: tx.hash, status: 'pending' };
}
```

**SDK NEVER Gets Private Key:**
```typescript
// @agentsbankai/sdk - client.ts
// What SDK sends to server
await client.sendTransaction(walletId, {
  to_address: 'recipient...',
  amount: '1.5'
  // ← No private key, just references wallet_id
});

// What SDK receives
{
  tx_hash: '0x123abc...',
  status: 'pending',
  timestamp: '2026-02-06T21:00:00Z'
  // ← Only public transaction info
}
```

---

## Admin Credentials - Never Published

### 1. What's NOT in npm Package

The published SDK (`@agentsbankai/sdk@1.0.1`) contains ONLY:
```json
{
  "files": ["dist", "README.md", "LICENSE"],
  "main": "dist/index.js",
  "types": "dist/index.d.ts"
}
```

**NOT included:**
- ❌ `.env` files (admin keys, JWT secrets)
- ❌ Backend source code (server logic)
- ❌ Database credentials
- ❌ Private keys or key storage logic
- ❌ Admin APIs or routes

### 2. What's NOT in GitHub

The published repository (`cryruz/agentsbank`) contains ONLY:
```
✅ SDK source code (src/client.ts, src/types.ts)
✅ Backend source code (deployment reference only)
✅ Documentation (README, guides)
✅ Examples (how to use SDK)

❌ .env files (gitignored)
❌ Private keys (never committed)
❌ Admin credentials (never committed)
❌ Vault secrets (never committed)
❌ Database backups (gitignored)
```

**Git ignore rules:**
```bash
.env                    # Production secrets
.env.local              # Local development secrets
*.key                   # Private keys
*.pem                   # Certificates
credentials.json        # Service account keys
treasury-backup.json    # Backup wallets
```

### 3. SDK .npmignore

Prevents accidental inclusion of sensitive files:
```
# Source files (only dist/ is published)
src/
tests/

# Configuration
tsconfig.json
vitest.config.ts

# Environment
.env
.env.local
.env.*.vault

# Git
.git/
.gitignore
.github/
```

---

## Request Flow - Ownership Verification

```
┌─────────────────────────────────────────────────────────┐
│ AGENT REQUEST: Get my wallet #wallet-123                │
└─────────────────────────────────────────────────────────┘
                         ↓
          ┌──────────────────────────────┐
          │ 1. Auth Middleware           │
          │ Verify JWT or API Key        │
          │ Extract: req.agent.sub       │
          └──────────────────────────────┘
                         ↓
          ┌──────────────────────────────┐
          │ 2. Route Handler             │
          │ GET /wallets/wallet-123      │
          └──────────────────────────────┘
                         ↓
          ┌──────────────────────────────┐
          │ 3. Database Query            │
          │ SELECT * FROM wallets        │
          │ WHERE wallet_id = 'wallet-123'
          └──────────────────────────────┘
                         ↓
          ┌──────────────────────────────┐
          │ 4. Ownership Check (CRITICAL)│
          │ if (req.agent.sub !=         │
          │     wallet.agent_id)         │
          │   return 403 Forbidden       │
          └──────────────────────────────┘
                         ↓ (Only if owned)
          ┌──────────────────────────────┐
          │ 5. Return Wallet Data        │
          │ HTTP 200 + wallet details    │
          │ (no private key)             │
          └──────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ AGENT RECEIVES: Wallet info (address, balance, etc)    │
│ IMPORTANT: No private key, no encryption secret        │
└─────────────────────────────────────────────────────────┘
```

---

## RLS (Row-Level Security) Policies

PostgreSQL RLS ensures database-level isolation:

```sql
-- Enable RLS on wallets table
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;

-- Policy: Agents can only see their own wallets
CREATE POLICY agent_wallet_isolation ON wallets
  FOR SELECT
  USING (
    agent_id = (
      SELECT agent_id FROM agents
      WHERE id = current_user_id()
    )
  );

-- Policy: Agents can only modify their own wallets
CREATE POLICY agent_wallet_write ON wallets
  FOR UPDATE
  USING (
    agent_id = (
      SELECT agent_id FROM agents
      WHERE id = current_user_id()
    )
  );
```

---

## Transaction History Isolation

Agents can only query their own transaction history:

```typescript
// src/routes/transactions.ts
transactionRouter.get('/wallet/:walletId', authMiddleware, async (req, res) => {
  const wallet = await WalletService.getWallet(req.params.walletId);
  
  // ⚠️ Verify ownership
  if (req.agent?.sub !== wallet.agent_id) {
    return res.status(403).json({ error: 'Not authorized' });
  }
  
  // Only return transactions for this wallet
  const transactions = await TransactionService.getHistory(walletId);
  res.json(transactions);
});
```

---

## Recovery & Backup

### BIP39 Recovery Words

Returned only once at registration:

```typescript
// Registration response
{
  agent_id: 'agent-uuid',
  agent_username: 'agent-name',
  api_key: 'uuid-format',
  token: 'jwt-token',
  recovery_words: [
    'abandon', 'ability', 'able', ... // 24 words for BIP39
  ]
}
```

**Security:**
- ✅ 24-word BIP39 seed phrase
- ✅ Returned only once (agent must save)
- ✅ Can recreate wallets if API key is lost
- ✅ Human-readable, can be printed & secured

---

## Checklist for Maintainers

### Before Publishing SDK to npm
- [ ] Verify `.npmignore` excludes all `.env` files
- [ ] Verify `dist/` contains ONLY compiled client code
- [ ] Verify no `@agentsbankai/sdk` mentions server secrets
- [ ] Run `npm publish --dry-run` to preview contents
- [ ] Verify published package has zero admin keys

### Before Pushing to GitHub
- [ ] `.env` file is in `.gitignore`
- [ ] No `.env` files in git history: `git log -p -- .env`
- [ ] No private keys committed: `git grep -i "private_key\|secret"`
- [ ] No credentials: `git grep -i "api_key\|admin_key"`
- [ ] Clean commit history: `git log --oneline | grep -i secret`

### Production Deployment
- [ ] VPS `.env` file is NOT in git
- [ ] Backend running as non-root user
- [ ] Private keys encrypted in database
- [ ] API key rate limiting enabled
- [ ] HTTPS enforced on all endpoints
- [ ] CORS properly configured (no `*` unless needed)

---

## Threat Model & Mitigations

| Threat | Impact | Mitigation |
|--------|--------|-----------|
| Private key compromise | Total asset loss | AES-256-GCM encryption + server-side signing |
| Agent accessing other agent's wallet | Cross-agent theft | Ownership checks on every request + RLS |
| Admin key exposed in SDK | All wallets compromised | Admin keys never in SDK, only in server .env |
| API key brute force | Account takeover | Rate limiting, long random keys (UUID) |
| Man-in-the-middle | Transaction hijacking | HTTPS enforced, cert pinning recommended |
| SQL injection | Data breach | Parameterized queries, Supabase auto-protection |

---

## Reporting Security Issues

If you discover a security vulnerability:

1. **DO NOT** post it publicly in GitHub issues
2. Email: `security@agentsbank.online` (or maintainers directly)
3. Include: Vulnerability description, reproduction steps, impact
4. Wait for acknowledgment before disclosure

---

**Last Updated:** 2026-02-06  
**Maintained By:** AgentsBank Team  
**Status:** ✅ Production Ready
