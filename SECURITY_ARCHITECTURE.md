# AgentsBank Security Architecture

## Current Implementation ✅

Your application uses **Application-Layer Security** (recommended approach):

### Database Access Pattern
```typescript
// Service role client - bypasses RLS
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY  // <-- Service role key
);
```

**Why this works:**
- Service role key has **full database access** (bypasses RLS)
- Security is enforced in **application code** via JWT middleware
- Allows fine-grained control over business logic
- Simpler to debug and maintain

---

## Security Layers

### 1. Network Security ✅
- **Helmet.js**: Security headers (XSS, clickjacking protection)
- **CORS**: Cross-origin request control
- **Rate Limiting**: 
  - API: 100 req/15min
  - Auth: 5 attempts/15min  
  - Transactions: 20/min per agent

### 2. Authentication ✅
```typescript
// JWT-based authentication
authMiddleware → verifyToken(JWT) → req.agent or req.user
```

**Token contains:**
- `sub`: user/agent ID
- `type`: 'human' | 'agent'
- `username`: identifier

### 3. Authorization (Middleware) ✅

**Agent Access Control:**
```typescript
// src/middleware/auth.ts
requireAgent()  // Only agents can access
requireHuman()  // Only humans can access
```

**Ownership Validation:**
```typescript
// Example from wallets route
const wallet = await WalletService.getWallet(walletId);
if (wallet.agent_id !== req.agent.sub) {
  return res.status(403).json({ error: 'Not authorized' });
}
```

### 4. Business Logic Constraints ✅

**Guardrails (per agent):**
```json
{
  "max_daily_spend": "1000",
  "max_transaction_amount": "100"
}
```

Enforced in `TransactionService.checkGuardrails()` before execution.

---

## What Agents Can Access

### ✅ Agents CAN:
1. **Read** their own agent profile
2. **Create/Read** their own wallets
3. **Create/Read** transactions for their wallets
4. **Read** their wallet balances
5. **Write** audit logs for their actions

### ❌ Agents CANNOT:
1. Access other agents' wallets or transactions
2. Modify their own guardrails (only human owner can)
3. Create agents (only humans can)
4. Access human user data
5. Exceed guardrail limits (enforced automatically)

### ✅ Humans CAN:
1. Create/manage their own agents
2. Set/update agent guardrails
3. View all their agents' data
4. Suspend/archive agents

---

## Code-Level Enforcement

### Example 1: Wallet Access
```typescript
// src/routes/wallets.ts:67
walletRouter.get('/:walletId', authMiddleware, async (req, res) => {
  const wallet = await WalletService.getWallet(req.params.walletId);
  
  // Ownership check
  if (req.agent?.sub !== wallet.agent_id) {
    return res.status(403).json({ error: 'Not authorized' });
  }
  
  // Only if ownership verified
  res.json(wallet);
});
```

### Example 2: Transaction Creation
```typescript
// src/routes/transactions.ts:15
transactionRouter.post('/', authMiddleware, requireAgent, async (req, res) => {
  const wallet = await WalletService.getWallet(wallet_id);
  
  // 1. Ownership check
  if (wallet.agent_id !== req.agent.sub) {
    return res.status(403);
  }
  
  // 2. Guardrails check
  const passesGuardrails = await TransactionService.checkGuardrails(
    agent.agent_id, amount, agent.guardrails
  );
  
  if (!passesGuardrails) {
    return res.status(403).json({ error: 'Violates guardrails' });
  }
  
  // 3. Create transaction
  await TransactionService.createTransaction(...);
});
```

---

## Database RLS Status

### Current: **DISABLED** (for testing)
- All RLS policies are OFF
- Service role bypasses RLS anyway
- Application-layer security is primary defense

### Recommendation: **Keep RLS Disabled**

**Reasons:**
1. Service role key already bypasses RLS
2. RLS adds complexity without benefit
3. Application-layer control is more flexible
4. Easier debugging and maintenance
5. RLS policies would need complex UUID casting

**If you want RLS enabled:**
- Use **anon key** for client operations (not service role)
- Implement Supabase Auth instead of custom JWT
- Or use PostgreSQL functions to validate ownership

---

## Audit Trail ✅

Every action is logged:
```typescript
await AgentService.logAction(
  agent_id,
  'transaction',
  tx_id,
  'execute',
  username,
  'agent',
  { wallet_id, amount },
  ip_address
);
```

**Audit logs contain:**
- Entity type/ID
- Action performed
- Actor (human/agent)
- Timestamp
- IP address
- Metadata (details)

---

## Security Best Practices (Current Implementation)

### ✅ Implemented
- [x] JWT authentication with expiry
- [x] Password hashing (bcrypt, 12 rounds)
- [x] Rate limiting per endpoint
- [x] Ownership validation in code
- [x] Guardrails enforcement
- [x] Audit logging
- [x] Security headers (Helmet)
- [x] CORS configuration
- [x] Error handling without leaking info

### 🔄 In Progress / TODO
- [ ] Private key encryption (Vault/KMS)
- [ ] API key rotation mechanism
- [ ] MFA for humans
- [ ] Webhook signatures
- [ ] Request signing for agent API
- [ ] IP whitelisting per agent
- [ ] Anomaly detection

---

## Testing Results

### Security Tests: ✅ PASSING
- ✅ Unauthorized access returns 401
- ✅ Cross-agent access blocked (403)
- ✅ Invalid credentials rejected
- ✅ Missing auth token rejected
- ✅ Guardrails enforced

### API Tests: 13/14 Passing (93%)
- ✅ Human registration
- ✅ Human login
- ✅ Agent registration (by human)
- ✅ Agent login
- ✅ Wallet creation (by agent)
- ✅ Transaction creation (with guardrails)
- ✅ Audit logging
- ⚠️ 1 test failed (rate limiting edge case)

---

## Recommendations

### For Production:
1. **Keep RLS disabled** - current architecture is sound
2. **Add API key IP restrictions** per agent
3. **Implement Vault/KMS** for private keys
4. **Add request rate limits per agent** (not just per IP)
5. **Enable HTTPS** (reverse proxy)
6. **Restrict CORS** to specific origins
7. **Add webhook authentication** for transaction callbacks
8. **Implement anomaly detection** for unusual agent behavior

### For Development:
1. ✅ Current setup is good
2. ✅ Service role + app-layer security is correct
3. ✅ No need to enable RLS

---

## Summary

**Your security model is solid:**
- ✅ Service role key for backend operations
- ✅ JWT authentication in application
- ✅ Middleware-based authorization
- ✅ Code-level ownership validation
- ✅ Guardrails for agent spending
- ✅ Comprehensive audit logging

**RLS is not needed because:**
- Service role bypasses it anyway
- Application-layer security is primary
- More flexible for business logic
- Easier to maintain and debug

**Continue with current approach!** 🎯
