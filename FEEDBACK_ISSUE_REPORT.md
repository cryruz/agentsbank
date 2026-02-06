# SDK Testing Feedback - Critical Issues Found

**Date:** February 6, 2026  
**Tester:** AI Agent (automated test)  
**Status:** 🔴 CRITICAL - Blocking SDK adoption

---

## Summary

An AI agent tested the SDK following official documentation. Documentation is clear and well-structured, but **actual API behavior differs significantly**. This creates a gap between "what docs say" and "what works."

### Test Results

| Feature | Docs | Reality | Status |
|---------|------|---------|--------|
| api_key authentication | ✅ Documented | ❌ Doesn't work | 🔴 BROKEN |
| token authentication | ✅ Works | ✅ Works | ✅ WORKS |
| wallet.wallet_id | ✅ Documented as returned | ❌ undefined | 🔴 BROKEN |
| getWallet() | ✅ Should work | ❌ 404 | 🔴 BROKEN |
| send() | ✅ Documented | ⏳ Not tested | 🟡 UNTESTED |
| getBalance() | ✅ Documented | ⏳ Not tested | 🟡 UNTESTED |
| getTransactionHistory() | ✅ Documented | ⏳ Not tested | 🟡 UNTESTED |

---

## Issue 1: wallet_id Missing from Wallet Creation Response

**Severity:** 🔴 CRITICAL

**Problem:**  
Wallet creation endpoint returns wallet but `wallet_id` field is undefined, making it impossible to use the wallet for subsequent operations.

**Documentation Says:**
```typescript
// From README
const wallet = await client.createWallet('solana');
const walletId = wallet.wallet_id; // "Use this for transactions"
```

**Reality:**
```typescript
// Actual response
{
  agent_id: "...",
  chain: "solana",
  address: "...",
  type: "custodial",
  created_at: "2026-02-06...",
  wallet_id: undefined  // ← MISSING!
}
```

**Root Cause:**  
Likely Supabase RLS policies filtering out `wallet_id` on SELECT, or the wallet service not explicitly returning it.

**Fix Required:**
```typescript
// In wallet.ts - createCustodialWallet, createSolanaWallet, createBitcoinWallet
return {
  wallet_id: walletId,      // ← ADD THIS
  chain: wallet.chain,
  address: wallet.address,
  created_at: wallet.created_at,
  // ... other fields
};
```

---

## Issue 2: getWallet() Returns 404

**Severity:** 🔴 CRITICAL

**Problem:**  
Attempting to retrieve wallet details returns 404 error.

**Documentation Says:**
```typescript
const wallet = await client.getWallet(walletId);
```

**Reality:**
```
GET /api/wallets/:walletId
Response: 404 Not Found
```

**Likely Causes:**
1. RLS policies restricting wallet access (perhaps agent can't read own wallets)
2. Query filtering is incorrect
3. Wallet not found in database

**Fix Required:**
Debug RLS policies in Supabase. Ensure:
- Agents can read their own wallets
- Query uses correct column (address vs wallet_id)

---

## Issue 3: API Key Authentication Doesn't Work

**Severity:** 🔴 CRITICAL

**Problem:**  
Documentation says agents can authenticate with `apiKey`, but it doesn't work. Registration returns `api_key` but the field appears to have no effect.

**Documentation Says:**
```typescript
const client = new AgentClient({
  apiKey: "agent_api_key_...",
});
```

**Reality:**  
- API Key authentication fails with 401
- Must use JWT token instead
- The `api_key` returned by registration is unclear in purpose

**Fix Required:**

**Option A - Make API Key work:**
```typescript
// In auth middleware
if (apiKey) {
  // Validate against stored api_key in agents table
  const agent = await supabase
    .from('agents')
    .select('*')
    .eq('api_key', apiKey)
    .single();
  // ... rest of validation
}
```

**Option B - Clarify in documentation:**
```markdown
### Authentication Methods

1. **JWT Token (Recommended)**
   - Use the `token` returned from registration
   - Set `Authorization: Bearer {token}`

2. **API Key** (Deprecated)
   - Currently unsupported. Use JWT instead.
   - Will be implemented in v1.1.0
```

---

## Issue 4: Transaction Methods Untested

**Severity:** 🟡 MEDIUM

**Problem:**  
Cannot verify transaction methods work as documented because wallet creation is broken.

**Untested Methods:**
- `send(walletId, toAddress, amount)`
- `getBalance(walletId)`
- `getTransactionHistory(walletId)`
- `estimateGas(walletId, ...)`

**Recommendation:**  
Fix Issues 1-3 first, then run full transaction flow testing.

---

## Recommended Fix Priority

### Phase 1 - Critical (Fix Tonight)
1. ✅ Add `wallet_id` to creation response
2. ✅ Fix `getWallet()` endpoint
3. ✅ Clarify API Key auth (deprecate or fix)

### Phase 2 - Testing (Tomorrow)
4. ✅ Test all transaction methods
5. ✅ Test error scenarios
6. ✅ Update docs with actual behavior

### Phase 3 - Enhancement (This Week)
7. ✅ Add request/response examples
8. ✅ Add error codes reference
9. ✅ Add rate limiting docs

---

## Example Corrected Flow (After Fixes)

```typescript
// 1. Create wallet
const wallet = await client.createWallet('solana');
console.log(wallet.wallet_id); // ✅ Now works

// 2. Get wallet details
const details = await client.getWallet(wallet.wallet_id);
console.log(details.address); // ✅ Now works

// 3. Send transaction
const tx = await client.send(wallet.wallet_id, 'address...', '1.5');
console.log(tx.txHash); // ✅ Should work

// 4. Check balance
const balance = await client.getBalance(wallet.wallet_id);
console.log(balance); // ✅ Should work
```

---

## Files Likely to Need Changes

- `src/services/wallet.ts` - createCustodialWallet, createSolanaWallet, createBitcoinWallet
- `src/services/wallet.ts` - getWallet() method
- `src/routes/wallets.ts` - GET /:walletId endpoint
- `src/middleware/auth.ts` - API Key authentication
- `README.md` - Update auth docs
- `supabase/migrations/` - Check RLS policies

---

## Testing Commands for Verification

```bash
# After fixes, verify with:

# 1. Create wallet
curl -X POST http://api.agentsbank.online/api/wallets \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"chain": "solana"}' | jq .wallet_id

# 2. Get wallet (should return 200, not 404)
curl -X GET http://api.agentsbank.online/api/wallets/{wallet_id} \
  -H "Authorization: Bearer $TOKEN"

# 3. Get balance
curl -X GET http://api.agentsbank.online/api/wallets/{wallet_id}/balance \
  -H "Authorization: Bearer $TOKEN"
```

---

## Feedback Summary

**Docs Quality:** ⭐⭐⭐⭐ (4/5) - Clear and comprehensive  
**Code Quality:** ⭐⭐⭐ (3/5) - Good, but RLS/auth issues  
**Feature Coverage:** ⭐⭐⭐ (3/5) - Missing actual validation  
**Developer Experience:** ⭐⭐ (2/5) - Docs don't match reality  

**Overall:** The foundation is solid, but implementation gaps prevent it from working as documented. **Critical: Fix wallet_id and getWallet() before any other work.**
