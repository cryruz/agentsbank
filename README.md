# 🏦 AgentsBank.ai – Decentralized Banking Platform for Autonomous AI Agents

A production-ready Node.js/TypeScript backend for autonomous AI agents to manage persistent identities, multi-chain wallets, and financial transactions.

## ⚡ Quick Start

### Prerequisites
- Node.js 18+
- npm or yarn
- Supabase project (free tier ok)

### 1. Clone & Install

```bash
cd agentsbank
npm install
```

### 2. Setup Supabase

1. Create a free Supabase project at [supabase.com](https://supabase.com)
2. Copy your credentials (URL, anon key, service role key)
3. Go to **SQL Editor** → **New Query**
4. Paste the contents of `src/db/schema.sql`
5. Run the query to create all tables

### 3. Environment Setup

```bash
cp .env.example .env
```

Update `.env`:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key
JWT_SECRET=your-super-secret-key-min-32-chars
PORT=3000
ETH_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/your-alchemy-key
```

### 4. Start Development Server

```bash
npm run dev
```

Server runs on `http://localhost:3000`

## 📚 API Endpoints

### Authentication

**Register Human User**
```bash
POST /api/auth/register
Content-Type: application/json

{
  "username": "alice",
  "email": "alice@example.com",
  "password": "secure_password"
}
```

**Login Human**
```bash
POST /api/auth/login
{
  "username": "alice",
  "password": "secure_password"
}

Response:
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "human": {
    "human_id": "uuid",
    "username": "alice",
    "email": "alice@example.com"
  }
}
```

**Agent Self-Registration** (agents register themselves AND their humans autonomously)
```bash
POST /api/auth/agent/register-self
Content-Type: application/json

{
  "human_username": "alice",
  "human_email": "alice@example.com",
  "first_name": "ChatBot",
  "last_name": "Pro",
  "agent_password": "SecurePass123!"
}

Response:
{
  "agent_id": "uuid",
  "agent_username": "agent_1706...",
  "api_key": "uuid",
  "did": "did:agentsbank:uuid",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "message": "Agent self-registered successfully"
}
```

**Interactive Agent Registration (via SDK)**
```typescript
import { AgentsBankSDK } from '@agentsbank/sdk';

const bank = new AgentsBankSDK({
  apiUrl: 'http://localhost:3000/api',
});

// Agent prompts human for information (interactive)
const { agentUsername, agentPassword, token } = await bank.registerSelf();

// Or with pre-provided values if agent already knows the info
const result = await bank.registerSelf({
  humanUsername: 'alice',
  humanEmail: 'alice@example.com',
  firstName: 'ChatBot',
  lastName: 'Pro',
  agentPassword: 'SecurePass123!',
});
```

**Agent Login**
```bash
POST /api/auth/agent/login
{
  "agent_username": "agent_1706...",
  "agent_password": "agent_secure_password"
}

Response:
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "agent": {
    "agent_id": "uuid",
    "agent_username": "agent_1706...",
    "did": "did:agentsbank:uuid"
  }
}
```

### Agents

**List Agents** (human only)
```bash
GET /api/agents
Authorization: Bearer <human-jwt-token>
```

**Get Agent Details**
```bash
GET /api/agents/:agentId
Authorization: Bearer <agent-jwt-token>
```

**Update Guardrails** (human only)
```bash
POST /api/agents/:agentId/guardrails
Authorization: Bearer <human-jwt-token>
Content-Type: application/json

{
  "guardrails": {
    "max_daily_spend": "500",
    "max_transaction_amount": "50"
  }
}
```

### Wallets

**Create Wallet** (agent only)
```bash
POST /api/wallets
Authorization: Bearer <agent-jwt-token>
Content-Type: application/json

{
  "chain": "ethereum",
  "type": "non-custodial"
}

Response:
{
  "wallet_id": "uuid",
  "agent_id": "uuid",
  "chain": "ethereum",
  "address": "0x742d35...",
  "type": "non-custodial",
  "created_at": "2026-02-06T..."
}
```

**Get Wallet Balance**
```bash
GET /api/wallets/:walletId/balance
Authorization: Bearer <agent-jwt-token>

Response:
{
  "wallet_id": "uuid",
  "chain": "ethereum",
  "address": "0x742d35...",
  "balance": {
    "native": "0.5"
  }
}
```

**Estimate Gas**
```bash
GET /api/wallets/:walletId/estimate-gas?to_address=0x...&amount=0.1
Authorization: Bearer <agent-jwt-token>

Response:
{
  "chain": "ethereum",
  "to_address": "0x...",
  "amount": "0.1",
  "estimated_gas": "0.002"
}
```

**Get Transaction History**
```bash
GET /api/wallets/:walletId/history?limit=50
Authorization: Bearer <agent-jwt-token>

Response:
{
  "wallet_id": "uuid",
  "transactions": [
    {
      "tx_id": "uuid",
      "type": "transfer",
      "amount": "0.5",
      "status": "confirmed",
      "tx_hash": "0x...",
      "timestamp": "2026-02-06T..."
    }
  ]
}
```

### Transactions

**Create Transaction**
```bash
POST /api/transactions
Authorization: Bearer <agent-jwt-token>
Content-Type: application/json

{
  "wallet_id": "uuid",
  "to_address": "0x742d35Cc6634C0532925a3b844Bc9e7595f7c8c",
  "amount": "0.1",
  "currency": "ETH",
  "type": "transfer"
}

Response:
{
  "tx_id": "uuid",
  "status": "pending",
  "amount": "0.1",
  "currency": "ETH",
  "from_address": "0x...",
  "to_address": "0x...",
  "timestamp": "2026-02-06T..."
}
```

**Get Transaction**
```bash
GET /api/transactions/:txId
Authorization: Bearer <agent-jwt-token>
```

**Get Wallet Transactions**
```bash
GET /api/transactions/wallet/:walletId?status=confirmed&limit=50
Authorization: Bearer <agent-jwt-token>

Response:
{
  "wallet_id": "uuid",
  "transactions": [...],
  "count": 10
}
```

**Get Transaction Stats**
```bash
GET /api/transactions/wallet/:walletId/stats?days=30
Authorization: Bearer <agent-jwt-token>

Response:
{
  "wallet_id": "uuid",
  "period_days": 30,
  "total_transactions": 42,
  "confirmed_transactions": 40,
  "failed_transactions": 2,
  "total_volume": "12.5",
  "total_fees": "0.025",
  "success_rate": 95.2
}
```

## 🏗️ Project Structure

```
agentsbank/
├── src/
│   ├── index.ts                 # Express server entry
│   ├── constants.ts             # Enum constants
│   ├── config/
│   │   └── supabase.ts         # Supabase client & types
│   ├── services/
│   │   ├── auth.ts             # Authentication logic
│   │   ├── agent.ts            # Agent operations
│   │   ├── wallet.ts           # Wallet & blockchain ops
│   │   └── transaction.ts      # Transaction logic
│   ├── routes/
│   │   ├── auth.ts             # Auth endpoints
│   │   ├── agents.ts           # Agent endpoints
│   │   ├── wallets.ts          # Wallet endpoints
│   │   └── transactions.ts     # Transaction endpoints
│   ├── middleware/
│   │   ├── auth.ts             # JWT & API key verification
│   │   └── errorHandler.ts     # Error handling
│   ├── utils/
│   │   ├── logger.ts           # Pino logger
│   │   └── helpers.ts          # Utility functions
│   └── db/
│       ├── schema.sql          # Database schema
│       └── migrate.ts          # Migration runner
├── dist/                        # Compiled output
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## 🔐 Security Features

- **JWT Authentication**: Bearer tokens for humans and agents
- **API Key Support**: For agent programmatic access
- **Guardrails**: Max daily spend & transaction limits per agent
- **Row-Level Security**: Database-level isolation via Supabase RLS
- **Password Hashing**: bcrypt with 12 rounds
- **Audit Logging**: All actions tracked with timestamps & IPs

## 🚀 Deployment

### Build for Production

```bash
npm run build
npm start
```

### Docker (Optional)

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
CMD ["node", "dist/index.js"]
```

## 📝 Database Schema

### Tables

| Table | Purpose |
|-------|---------|
| `humans` | Human owners of agents |
| `agents` | AI agent identities with DIDs |
| `wallets` | Multi-chain wallets (custodial/non-custodial) |
| `transactions` | Financial transaction history |
| `sessions` | User sessions & JWT tokens |
| `audit_logs` | All actions logged for compliance |

## 🔗 Integration Example (Python)

```python
import requests
import json

BASE_URL = "http://localhost:3000/api"

# 1. Register human
human_reg = requests.post(f"{BASE_URL}/auth/register", json={
    "username": "alice",
    "email": "alice@example.com",
    "password": "password123"
})
print(human_reg.json())

# 2. Login
login = requests.post(f"{BASE_URL}/auth/login", json={
    "username": "alice",
    "password": "password123"
})
human_token = login.json()["token"]

# 3. Register agent
agent_reg = requests.post(
    f"{BASE_URL}/auth/agent/register",
    headers={"Authorization": f"Bearer {human_token}"},
    json={
        "first_name": "Bot",
        "last_name": "Smith",
        "agent_password": "agentpass123"
    }
)
agent_data = agent_reg.json()
agent_id = agent_data["agent_id"]
api_key = agent_data["api_key"]

# 4. Login agent
agent_login = requests.post(f"{BASE_URL}/auth/agent/login", json={
    "agent_username": agent_data["agent_username"],
    "agent_password": "agentpass123"
})
agent_token = agent_login.json()["token"]

# 5. Create wallet
wallet = requests.post(
    f"{BASE_URL}/wallets",
    headers={"Authorization": f"Bearer {agent_token}"},
    json={"chain": "ethereum", "type": "non-custodial"}
)
wallet_id = wallet.json()["wallet_id"]
print(f"Wallet created: {wallet.json()['address']}")
```

## 🛠️ Available Commands

```bash
npm run dev         # Start dev server with hot-reload
npm run build       # Compile TypeScript
npm start           # Run compiled server
npm run migrate     # Run database migrations
npm run lint        # ESLint check
npm run format      # Prettier format
npm test            # Run tests (vitest)
```

## 📖 Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `SUPABASE_URL` | Supabase project URL | `https://xyz.supabase.co` |
| `SUPABASE_ANON_KEY` | Supabase anon key | `eyJhbG...` |
| `SUPABASE_SERVICE_KEY` | Service role key (admin) | `eyJhbG...` |
| `JWT_SECRET` | Secret for signing JWTs | `min-32-chars-required` |
| `JWT_EXPIRES_IN` | Token expiration | `7d` |
| `PORT` | Server port | `3000` |
| `NODE_ENV` | Environment | `development` \| `production` |
| `ETH_RPC_URL` | Ethereum RPC endpoint | `https://...` |
| `BNB_RPC_URL` | BNB Chain RPC endpoint | `https://...` |
| `SOL_RPC_URL` | Solana RPC endpoint | `https://...` |

## 🗺️ Roadmap

- [ ] Private key management with Vault/KMS
- [ ] On-chain transaction signing & broadcasting
- [ ] Uniswap/Aave API integration for swaps & staking
- [ ] Agent reputation scoring (on-chain)
- [ ] Multi-signature wallets
- [ ] Fiat on/off ramps
- [ ] WebSocket for real-time updates
- [ ] Agent swarms (team wallets)
- [ ] GraphQL API

## ⚠️ Important Security Notes

1. **Private Keys**: Currently stored as hashes only. Implement Vault/KMS in production.
2. **RLS Policies**: Enable and test Supabase RLS policies before production.
3. **Rate Limiting**: Add rate limiting middleware for production.
4. **HTTPS**: Use HTTPS in production.
5. **CORS**: Configure CORS with specific allowed origins.

## 📞 Support

- Docs: See `projectidea.md`
- Issues: Report in GitHub
- Questions: Check existing documentation

---

**Built for the Agent Economy 🤖💰**
