# @agentsbank/sdk

Official TypeScript/JavaScript SDK for [AgentsBank](https://agentsbank.online) - Crypto banking infrastructure for AI agents.

**Version: 1.0.6** - SDK compilation fixes, security improvements, and production-ready for public use!

## Features

- 🔐 **Full Authentication** - Register, login, API keys, JWT tokens
- 💰 **Multi-Chain Wallets** - Ethereum, BSC, Solana, Bitcoin
- 📤 **Send Transactions** - Native tokens + USDC/USDT
- ✍️ **Message Signing** - Prove wallet ownership
- 📊 **Balance & History** - Real-time blockchain data
- 🔒 **TypeScript First** - Full type safety
- ⚡ **Enterprise Features** (NEW!)
  - Automatic retry with exponential backoff (3 attempts by default)
  - Response caching (50-70x faster reads)
  - Typed error handling (19 error codes)
  - Webhook notifications (7 event types)
  - Guardrails (spending limits, whitelisting)
  - SDK helpers (sendSafe, sendMultiple, hasEnoughFunds)
- 💰 **Always Free** - 0% platform fees, pay only network gas
- 📈 **Monitoring** - Health checks, metrics, real-time dashboard

## Installation

```bash
npm install @agentsbank/sdk
# or
yarn add @agentsbank/sdk
# or
pnpm add @agentsbank/sdk
```

## Quick Start

```typescript
import { createClient } from '@agentsbank/sdk';

// Create client
const client = createClient({
  baseUrl: 'https://api.agentsbank.online'
});

// Register a new agent
const agent = await client.register({
  human_username: 'myuser',
  human_email: 'user@example.com',
  first_name: 'John',
  last_name: 'Doe',
  agent_password: 'SecurePass123!'
});

// Token is auto-set after registration
console.log('Agent ID:', agent.agent_id);
console.log('Wallets:', agent.wallets);

// ⚠️ SAVE RECOVERY WORDS SECURELY!
console.log('Recovery:', agent.recovery_words);
```

## Authentication

### Using API Key

```typescript
const client = createClient({
  apiKey: 'your-api-key'
});
```

### Using JWT Token

```typescript
const client = createClient({
  token: 'your-jwt-token'
});

// Or set later
client.setToken(token);
```

### Login

```typescript
await client.login({
  agent_username: 'agent_123456_abc',
  agent_password: 'SecurePass123!'
});
// Token is auto-set
```

## Wallets

### Create Wallet

```typescript
// Supported chains: 'ethereum', 'bsc', 'solana', 'bitcoin'
const wallet = await client.createWallet('solana');

console.log(wallet.address);  // Solana address
console.log(wallet.wallet_id); // Use for transactions
```

### Get Balance

```typescript
const { balance } = await client.getBalance(walletId);

console.log(`SOL: ${balance.SOL}`);
console.log(`USDC: ${balance.USDC}`);
```

## Transactions

### Send Native Token

```typescript
const tx = await client.send(walletId, {
  to_address: 'recipient_address',
  amount: '0.1'  // 0.1 SOL/ETH/BNB/BTC
});

console.log(`TX Hash: ${tx.tx_hash}`);
console.log(`Status: ${tx.status}`);
```

### Send Token (USDC/USDT)

```typescript
const tx = await client.send(walletId, {
  to_address: 'recipient_address',
  amount: '100',
  currency: 'USDC'
});
```

### Estimate Fees

```typescript
const estimate = await client.estimateGas(
  walletId,
  'recipient_address',
  '1.0'
);

console.log(`Estimated gas: ${estimate.estimated_gas}`);
```

## Message Signing

Sign messages for authentication with external services:

```typescript
const { signature } = await client.signMessage(
  walletId,
  'Sign in to MyApp: nonce=abc123'
);

// signature can be verified on-chain
```

## Transaction History

```typescript
const { transactions } = await client.getTransactionHistory(walletId, 50);

for (const tx of transactions) {
  console.log(`${tx.type}: ${tx.amount} ${tx.currency} -> ${tx.to_address}`);
}
```

## Supported Chains

| Chain | Native Token | Tokens | Address Format |
|-------|--------------|--------|----------------|
| Ethereum | ETH | USDT, USDC | 0x... |
| BSC | BNB | USDT, USDC | 0x... |
| Solana | SOL | USDT, USDC | Base58 |
| Bitcoin | BTC | - | bc1... (SegWit) |

## Error Handling

AgentsBank SDK includes 19 typed error codes for precise error handling:

```typescript
import { AgentsBankError, ErrorCode } from '@agentsbank/sdk';

try {
  await client.send(walletId, { to_address, amount: '1000' });
} catch (error) {
  if (error instanceof AgentsBankError) {
    switch (error.code) {
      case ErrorCode.INSUFFICIENT_FUNDS:
        console.error('Not enough balance');
        break;
      case ErrorCode.INVALID_ADDRESS:
        console.error('Invalid recipient address');
        break;
      case ErrorCode.TIMEOUT:
        console.error('Request timeout (SDK already retried)');
        break;
      case ErrorCode.RATE_LIMITED:
        console.error('Rate limited (SDK already retried)');
        break;
      default:
        console.error(`Error ${error.code}: ${error.message}`);
    }
  }
}
```

### Automatic Retry

Transient errors (network timeouts, temporary 5xx errors, rate limits) are automatically retried with exponential backoff:

```typescript
// Configure retry behavior
const client = createClient({
  baseUrl: 'https://api.agentsbank.online',
  retryConfig: {
    maxAttempts: 3,           // Default
    initialDelayMs: 100,      // Default
    maxDelayMs: 5000          // Default
  }
});
```

Automatic retry applies to:
- ✅ Network timeouts
- ✅ Temporary 5xx server errors
- ✅ Rate limit (429) responses
- ✅ RPC failures

Not retried (fail immediately):
- ❌ Invalid address format
- ❌ Insufficient funds
- ❌ Authentication errors
- ❌ Permission denied
- ❌ Resource not found

## Configuration Options

```typescript
const client = createClient({
  // API endpoint (default: https://api.agentsbank.online)
  baseUrl: 'https://api.agentsbank.online',
  
  // Authentication (pick one)
  apiKey: 'your-api-key',
  token: 'your-jwt-token',
  
  // Request timeout in ms (default: 30000)
  timeout: 60000,
  
  // Retry configuration (default shown)
  retryConfig: {
    maxAttempts: 3,
    initialDelayMs: 100,
    maxDelayMs: 5000
  },
  
  // Guardrails for spending limits
  guardrails: {
    dailyLimitUSD: 5000,
    maxPerTxUSD: 1000,
    whitelistedAddresses: ['0x...']
  },
  
  // Custom fetch implementation (for Node.js < 18)
  fetch: customFetch
});
```

## SDK Helpers

Available since v1.0.5: Convenient helper methods that combine best practices:

### sendSafe - Pre-flight Validation

```typescript
// Includes balance check, gas estimation, and auto-retry
const tx = await client.sendSafe(walletId, {
  to_address: recipient,
  amount: '1.0'
});
```

### sendMultiple - Batch Operations

```typescript
// Send to multiple recipients efficiently
const results = await client.sendMultiple(walletId, [
  { to_address: '0x111...', amount: '1.0' },
  { to_address: '0x222...', amount: '2.0' },
  { to_address: '0x333...', amount: '1.5' }
]);

results.forEach((tx, i) => {
  console.log(`Recipient ${i+1}: ${tx.tx_hash}`);
});
```

### hasEnoughFunds - Balance Check

```typescript
const hasEnough = await client.hasEnoughFunds(walletId, '100');
if (!hasEnough) {
  console.log('Insufficient balance');
}
```

## Webhooks

Subscribe to transaction events:

```typescript
// Register webhook
const webhook = await client.registerWebhook({
  url: 'https://your-server.com/webhook',
  events: ['transaction.sent', 'transaction.received']
});

// Verify webhook signature (HMAC-SHA256)
import crypto from 'crypto';

const signature = req.headers['x-agentsbank-signature'];
const payload = req.body;

const verified = crypto
  .createHmac('sha256', webhook.secret)
  .update(JSON.stringify(payload))
  .digest('hex') === signature;
```

Supported events:
- `transaction.sent` - Outgoing transaction
- `transaction.received` - Incoming transaction
- `transaction.confirmed` - Transaction confirmed
- `wallet.created` - New wallet
- `balance.changed` - Balance update
- `error.occurred` - Error event
- `agent.login` - Agent login

## Guardrails

Enforce spending limits and whitelisting:

```typescript
// Set on client
const client = createClient({
  guardrails: {
    dailyLimitUSD: 10000,
    maxPerTxUSD: 5000,
    whitelistedAddresses: [
      '0x1234567890123456789012345678901234567890'
    ]
  }
});

// Automatic enforcement
try {
  await client.send(walletId, {
    to_address: '0xunknown...', // Not whitelisted
    amount: '6000'               // Over max per tx
  });
} catch (e) {
  // "Rejected: transaction exceeds max per tx limit"
}
```

## Caching

Responses are automatically cached for performance:

```
Balance lookup:     30 seconds  (50-70x faster)
Transaction list:   2 minutes
Gas estimate:       5 minutes
Wallet info:        24 hours
```

Caching is transparent and automatic. Failed cache lookups gracefully fall back to direct RPC calls.

## Monitoring

Check system health and metrics:

```typescript
// Health check
const health = await fetch('https://api.agentsbank.online/health');
// { status: 'ok', timestamp: '...', version: '1.0.6' }

// Metrics
const metrics = await fetch('https://api.agentsbank.online/api/metrics');
// { requests_per_second: 45, cache_hit_rate: 0.68, ... }

// Live dashboard
// https://api.agentsbank.online/api/monitoring/dashboard
```

## TypeScript

Full type definitions included:

```typescript
import type {
  Chain,
  Currency,
  WalletInfo,
  Transaction,
  SendTransactionRequest
} from '@agentsbank/sdk';

const chain: Chain = 'solana';
const currency: Currency = 'USDC';
```

## Support

- 📧 Email: info@agentsbank.online
- 🌐 Website: https://agentsbank.online
- 📚 Docs: https://docs.agentsbank.online
- 📊 API Docs: https://api.agentsbank.online/docs
- 📈 Dashboard: https://api.agentsbank.online/api/monitoring/dashboard

## Pricing

**Always Free** 🎉

- 0% platform fees (completely free)
- Only blockchain network/gas fees apply
- Unlimited wallets and transactions
- No credit card required

## Deployment

### Auto-Updates

The SDK automatically checks for updates from the server:

```typescript
// Automatic version checking (24-hour intervals)
const client = createClient({
  baseUrl: 'https://api.agentsbank.online'
  // Auto-update checking enabled by default
});
```

Check version status manually:

```typescript
const response = await fetch('https://api.agentsbank.online/api/sdk/version');
const { version, required, releaseDate } = await response.json();
```

### Node.js Version

Requires Node.js 18+ (for native fetch support). For older versions, provide custom fetch:

```typescript
import fetch from 'node-fetch';

const client = createClient({
  baseUrl: 'https://api.agentsbank.online',
  fetch
});
```

## License

MIT © AgentsBank
