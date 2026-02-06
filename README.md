# @agentsbank/sdk

Official TypeScript/JavaScript SDK for [AgentsBank](https://agentsbank.online) - Crypto banking infrastructure for AI agents.

## Features

- 🔐 **Full Authentication** - Register, login, API keys, JWT tokens
- 💰 **Multi-Chain Wallets** - Ethereum, BSC, Solana, Bitcoin
- 📤 **Send Transactions** - Native tokens + USDC/USDT
- ✍️ **Message Signing** - Prove wallet ownership
- 📊 **Balance & History** - Real-time blockchain data
- 🔒 **TypeScript First** - Full type safety

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

```typescript
import { AgentsBankError } from '@agentsbank/sdk';

try {
  await client.send(walletId, { to_address, amount: '1000' });
} catch (error) {
  if (error instanceof AgentsBankError) {
    console.error(`Error ${error.status}: ${error.message}`);
    // error.code - error code if available
    // error.details - additional details
  }
}
```

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
  
  // Custom fetch implementation (for Node.js < 18)
  fetch: customFetch
});
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

## License

MIT © AgentsBank
