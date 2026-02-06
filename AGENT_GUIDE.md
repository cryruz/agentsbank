# 🤖 Agent Quick Start Guide

## Agent-Only Registration Flow

AgentsBank is designed for agents to autonomously manage themselves and their human owners. Here's how it works:

### Registration Flow

1. **Agent initializes SDK**
```typescript
import { AgentsBankSDK } from '@agentsbank/sdk';

const bank = new AgentsBankSDK({
  apiUrl: 'https://api.agentsbank.ai',
});
```

2. **Agent registers itself and its human**

**Option A: Interactive (Agent asks human for info)**
```typescript
// Agent prompts the human for necessary information
const { agentUsername, agentPassword, token } = await bank.registerSelf();

// Output:
// 🤖 Agent Self-Registration
// ========================
// 
// I need to register you and your human owner.
// 
// Human username: alice
// Human email: alice@example.com
// Agent first name (default: AI): ChatBot
// Agent last name (default: Agent): Pro
// Agent password (min 8 chars, 1 uppercase, 1 number, 1 special char): SecurePass123!
// 
// ✅ Registration successful!
// Agent Username: agent_1706123456_xyz123
// Agent DID: did:agentsbank:550e8400-e29b-41d4-a716-446655440000
```

**Option B: Programmatic (Agent already knows the info)**
```typescript
// Agent uses pre-configured values
const result = await bank.registerSelf({
  humanUsername: 'alice',
  humanEmail: 'alice@example.com',
  firstName: 'ChatBot',
  lastName: 'Pro',
  agentPassword: 'SecurePass123!',
});

console.log(`Agent registered: ${result.agentUsername}`);
```

### Create Wallets

After registration, agent can create wallets for blockchain operations:

```typescript
// Create an Ethereum wallet
const ethWallet = await bank.createWallet('ethereum');
console.log(`ETH wallet: ${ethWallet.address}`);

// Create a Bitcoin wallet
const btcWallet = await bank.createWallet('bitcoin');
console.log(`BTC wallet: ${btcWallet.address}`);

// Create a Solana wallet
const solWallet = await bank.createWallet('solana');
console.log(`SOL wallet: ${solWallet.address}`);

// Create a custodial wallet (server manages keys)
const custodialWallet = await bank.createWallet('ethereum', 'custodial');
```

### Supported Chains

- **ethereum** - Ethereum mainnet
- **bsc** - Binance Smart Chain
- **solana** - Solana blockchain
- **bitcoin** - Bitcoin blockchain

### Supported Currencies

- **ETH** - Ethereum
- **BNB** - Binance Coin
- **SOL** - Solana
- **BTC** - Bitcoin
- **USDT** - Tether (USDT)
- **USDC** - USD Coin (USDC)

### Next Steps

Once registered and with wallets created, agents can:

1. **Check wallet balances**
```typescript
const balance = await bank.getBalance(walletId);
console.log(balance); // { 'ETH': '1.5', 'USDC': '100' }
```

2. **Send transactions**
```typescript
const tx = await bank.sendTransaction(
  walletId,
  '0x742d35Cc6634C0532925a3b844Bc4e7595f42bE1',
  '0.5',
  'ETH'
);
```

3. **View transaction history**
```typescript
const history = await bank.getTransactionHistory(walletId);
```

4. **Set guardrails (human only)**
```typescript
// Via API with human JWT token
const guardrails = {
  max_daily_spend: '1000',
  max_transaction_amount: '100',
  whitelist_addresses: ['0x742d35Cc6634C0532925a3b844Bc4e7595f42bE1'],
};
```

## Key Features

✅ **Agent Autonomy** - Agents register themselves without needing human intervention on the backend
✅ **Interactive Setup** - Agents can ask humans for information when needed
✅ **Multi-Chain** - Support for Ethereum, BSC, Solana, and Bitcoin
✅ **Security** - Password validation, JWT tokens, and secure credential management
✅ **DID Identity** - Each agent gets a decentralized identity

## Environment Setup

```bash
# Agent configuration
export AGENTSBANK_API_URL="https://api.agentsbank.ai"
export ETH_RPC_URL="https://eth-mainnet.g.alchemy.com/v2/your-key"
export BNB_RPC_URL="https://bsc-dataseed.bnbchain.org"
export SOL_RPC_URL="https://api.mainnet-beta.solana.com"
export BTC_RPC_URL="https://btc-mainnet.g.alchemy.com/v2/your-key"
```

## Error Handling

```typescript
try {
  await bank.registerSelf();
} catch (error) {
  console.error('Registration failed:', error.message);
  // Handle error - could retry or prompt user for different info
}
```

## Advanced Usage

### Custom Prompt Function

```typescript
// Use a custom prompt function instead of console input
const customPrompt = async (message: string) => {
  // Your custom implementation
  return userInput;
};

const result = await bank.registerSelf({
  promptFn: customPrompt,
});
```

### Save Credentials for Later

```typescript
// After successful registration, save credentials
const credentials = {
  agentUsername: result.agentUsername,
  agentPassword: result.agentPassword,
  token: result.token,
};

// Store securely (encryption recommended)
fs.writeFileSync('agent-credentials.json', JSON.stringify(credentials));

// Later, restore from file
const saved = JSON.parse(fs.readFileSync('agent-credentials.json'));
const bank = new AgentsBankSDK({
  apiUrl: 'https://api.agentsbank.ai',
  agentUsername: saved.agentUsername,
  agentPassword: saved.agentPassword,
  token: saved.token,
});
```

---

For more information, see the [main README](../README.md) or [API documentation](../README.md#-api-endpoints).
