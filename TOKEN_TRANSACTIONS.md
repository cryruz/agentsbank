# Token Transactions Documentation

## Overview

The AgentsBank.ai SDK now supports full token transaction functionality across all supported blockchains and tokens:

### Supported Chains
- **Ethereum** - ERC-20 tokens (USDT, USDC) + native ETH
- **BSC (Binance Smart Chain)** - ERC-20 tokens (USDT, USDC) + native BNB  
- **Solana** - SPL tokens (USDT, USDC) + native SOL
- **Bitcoin** - Native BTC only

### Supported Tokens
- **Ethereum**: ETH, USDT, USDC
- **BSC**: BNB, USDT, USDC
- **Solana**: SOL, USDT, USDC
- **Bitcoin**: BTC

## Quick Start

### 1. Send USDT on Ethereum

```typescript
import { AgentsBankSDK } from '@agentsbank/sdk';

const bank = new AgentsBankSDK({
  apiUrl: 'https://api.agentsbank.ai',
  agentUsername: 'your_agent',
  agentPassword: 'your_password',
});

// Create wallet
const wallet = await bank.createWallet('ethereum');

// Send 100 USDT
const tx = await bank.sendTokenTransfer(
  wallet.wallet_id,
  '0x742d35Cc6634C0532925a3b844Bc9e7595f1bEb',
  '100',
  'USDT'
);

console.log(`Transaction: ${tx.tx_id}`);
console.log(`Status: ${tx.status}`);
```

### 2. Send USDC on BSC

```typescript
const wallet = await bank.createWallet('bsc');

const tx = await bank.sendTokenTransfer(
  wallet.wallet_id,
  '0x742d35Cc6634C0532925a3b844Bc9e7595f1bEb',
  '50',
  'USDC'
);
```

### 3. Send Native Tokens

```typescript
// Send 0.5 ETH
await bank.sendTransaction(
  wallet.wallet_id,
  '0x742d35Cc6634C0532925a3b844Bc9e7595f1bEb',
  '0.5',
  'ETH'
);

// Send 1 BNB
await bank.sendTransaction(
  wallet.wallet_id,
  '0x742d35Cc6634C0532925a3b844Bc9e7595f1bEb',
  '1',
  'BNB'
);
```

## API Reference

### sendTokenTransfer()

Send tokens (USDT, USDC) to any address.

```typescript
async sendTokenTransfer(
  walletId: string,
  toAddress: string,
  amount: string,
  token: 'USDT' | 'USDC' | string
): Promise<TransactionInfo>
```

**Parameters:**
- `walletId` - The wallet ID to send from
- `toAddress` - Recipient Ethereum/BSC address or Solana public key
- `amount` - Amount to send (e.g., "100" for 100 USDT)
- `token` - Token type: USDT, USDC

**Returns:** `TransactionInfo` with transaction ID and status

**Example:**
```typescript
const tx = await bank.sendTokenTransfer(
  'wallet_123',
  '0x742d35Cc6634C0532925a3b844Bc9e7595f1bEb',
  '250.50',
  'USDC'
);
```

### sendTransaction()

Send any supported currency (native or token).

```typescript
async sendTransaction(
  walletId: string,
  toAddress: string,
  amount: string,
  currency: string = 'ETH'
): Promise<TransactionInfo>
```

**Parameters:**
- `walletId` - Wallet ID
- `toAddress` - Recipient address
- `amount` - Amount to send
- `currency` - Currency/token: ETH, BNB, SOL, BTC, USDT, USDC

**Example:**
```typescript
// Send ETH
const tx1 = await bank.sendTransaction(
  'wallet_123',
  '0x742d35Cc6634C0532925a3b844Bc9e7595f1bEb',
  '0.5',
  'ETH'
);

// Send USDT
const tx2 = await bank.sendTransaction(
  'wallet_123',
  '0x742d35Cc6634C0532925a3b844Bc9e7595f1bEb',
  '100',
  'USDT'
);
```

### estimateGasForTransaction()

Estimate gas/network fees before sending.

```typescript
async estimateGasForTransaction(
  walletId: string,
  toAddress: string,
  amount: string,
  currency: string = 'ETH'
): Promise<{ gasEstimate: string; gasPrice: string; totalCost: string }>
```

**Example:**
```typescript
const estimate = await bank.estimateGasForTransaction(
  'wallet_123',
  '0x742d35Cc6634C0532925a3b844Bc9e7595f1bEb',
  '100',
  'USDT'
);

console.log(`Gas: ${estimate.gasEstimate}`);
console.log(`Total cost: ${estimate.totalCost} ETH`);
```

### getTransactionHistory()

Get transaction history for a wallet.

```typescript
async getTransactionHistory(
  walletId: string,
  limit: number = 50
): Promise<TransactionInfo[]>
```

**Example:**
```typescript
const history = await bank.getTransactionHistory('wallet_123', 20);

for (const tx of history) {
  console.log(`${tx.tx_id}: ${tx.amount} ${tx.currency}`);
}
```

### waitForConfirmation()

Wait for transaction to be confirmed on-chain.

```typescript
async waitForConfirmation(
  txId: string,
  maxWaitMs: number = 300000,
  pollIntervalMs: number = 5000
): Promise<TransactionInfo>
```

**Example:**
```typescript
const tx = await bank.sendTokenTransfer(wallet_id, to, '100', 'USDT');
const confirmed = await bank.waitForConfirmation(tx.tx_id);
console.log(`Confirmed: ${confirmed.tx_hash}`);
```

### getTransaction()

Get details of a specific transaction.

```typescript
async getTransaction(txId: string): Promise<TransactionInfo>
```

**Example:**
```typescript
const tx = await bank.getTransaction('tx_abc123');
console.log(`Status: ${tx.status}`);
console.log(`Amount: ${tx.amount} ${tx.currency}`);
```

## Transaction Types

### TransactionInfo

```typescript
interface TransactionInfo {
  tx_id: string;                    // Transaction ID
  wallet_id: string;                // Wallet that initiated it
  type: string;                     // 'transfer', 'swap', 'stake', etc.
  amount: string;                   // Amount sent
  currency: string;                 // Token: ETH, USDT, USDC, etc.
  from_address: string;             // Sender address
  to_address: string;               // Recipient address
  tx_hash?: string;                 // Blockchain transaction hash
  status: 'pending' | 'confirmed' | 'failed';
  fee: string;                      // Network fee
  timestamp: string;                // ISO timestamp
}
```

## Supported Contracts

### Ethereum
- **USDT**: `0xdac17f958d2ee523a2206206994597c13d831ec7`
- **USDC**: `0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48`

### BSC
- **USDT**: `0x55d398326f99059fF775485246999027B3197955`
- **USDC**: `0x8AC76a51cc950d9822D68b83FE1Ad97B32Cd580d`

### Solana
- **USDT**: `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenBC1`
- **USDC**: `EPjFWaLb3hyccqJ1xNEsWqkBKAoDo59755dK48kQMPS`

## Error Handling

```typescript
try {
  const tx = await bank.sendTokenTransfer(wallet_id, to, '100', 'USDT');
  console.log(`Sent: ${tx.tx_id}`);
} catch (error) {
  if (error.message.includes('insufficient')) {
    console.log('Insufficient balance');
  } else if (error.message.includes('guardrails')) {
    console.log('Transaction rejected by guardrails');
  } else {
    console.log(`Error: ${error.message}`);
  }
}
```

## Best Practices

### 1. Always Estimate Gas First
```typescript
// Get fee estimate before sending large amounts
const estimate = await bank.estimateGasForTransaction(
  wallet_id,
  to_address,
  amount,
  'USDT'
);

if (parseFloat(estimate.totalCost) > maxAcceptableFee) {
  console.log('Gas price too high, waiting...');
  return;
}
```

### 2. Verify Addresses
```typescript
// Validate address format before sending
if (!toAddress.startsWith('0x') || toAddress.length !== 42) {
  throw new Error('Invalid Ethereum address');
}

// Confirm recipient is correct
console.log(`Sending to: ${toAddress}`);
```

### 3. Wait for Confirmation
```typescript
const tx = await bank.sendTokenTransfer(wallet_id, to, amount, 'USDT');

// Wait for on-chain confirmation before considering it complete
const confirmed = await bank.waitForConfirmation(tx.tx_id);
console.log(`Confirmed in block: ${confirmed.tx_hash}`);
```

### 4. Implement Retry Logic
```typescript
async function sendWithRetry(wallet_id, to, amount, token, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await bank.sendTokenTransfer(wallet_id, to, amount, token);
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}
```

## Roadmap

### Currently Implemented
- ✅ ERC-20 token transfers (USDT, USDC) on Ethereum/BSC
- ✅ Native token transfers (ETH, BNB)
- ✅ Transaction status tracking
- ✅ Gas estimation
- ✅ Batch transfer support

### Coming Soon
- 🔄 SPL token transfers on Solana
- 🔄 Bitcoin transaction signing
- 🔄 Private key retrieval from Vault
- 🔄 Token swaps
- 🔄 Staking/unstaking

## Security Notes

⚠️ **Current Implementation:**
- Transactions are created and queued but require private key retrieval from secure vault
- Private keys are never exposed to the SDK
- All transaction data is stored encrypted
- Guardrails prevent unauthorized large transfers

⚠️ **Production Requirements:**
- Must integrate with HashiCorp Vault or similar KMS
- Use threshold signatures or MPC for key management
- Never store private keys in plaintext
- Implement rate limiting and monitoring
- Regular security audits required

## Support

For questions or issues:
- Documentation: https://docs.agentsbank.ai
- GitHub: https://github.com/agentsbank/sdk
- Discord: https://discord.gg/agentsbank
