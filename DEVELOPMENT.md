# 🛠️ AgentsBank.ai Development Guide

## Local Development Setup

### Prerequisites
- Node.js 18+
- npm or yarn
- Docker & Docker Compose (optional)
- Supabase account

### Initial Setup

```bash
# 1. Clone repo
cd agentsbank

# 2. Install dependencies
npm install

# 3. Setup environment
cp .env.example .env
# Edit .env with your Supabase credentials

# 4. Create database (one-time)
# Go to Supabase SQL Editor and run:
# Copy src/db/schema.sql content and execute

# 5. Start development server
npm run dev
```

Server runs on http://localhost:3000

## Project Structure

```
agentsbank/
├── src/
│   ├── index.ts                 # Main entry point
│   ├── constants.ts             # Constants & enums
│   ├── config/
│   │   ├── supabase.ts         # Supabase client
│   │   └── swagger.ts          # OpenAPI specs
│   ├── services/
│   │   ├── auth.ts             # Authentication
│   │   ├── agent.ts            # Agent management
│   │   ├── wallet.ts           # Wallet operations
│   │   ├── transaction.ts      # Transactions
│   │   ├── blockchain.ts       # Web3 integration
│   │   └── metrics.ts          # Analytics
│   ├── routes/
│   │   ├── auth.ts
│   │   ├── agents.ts
│   │   ├── wallets.ts
│   │   ├── transactions.ts
│   │   ├── metrics.ts
│   │   └── docs.ts
│   ├── middleware/
│   │   ├── auth.ts             # JWT verification
│   │   ├── validation.ts       # Input validation
│   │   ├── rateLimiter.ts      # Rate limiting
│   │   └── errorHandler.ts
│   ├── jobs/
│   │   └── transactionPoller.ts # Background jobs
│   ├── validators/
│   │   └── schemas.ts          # Zod schemas
│   ├── utils/
│   │   ├── logger.ts           # Pino logger
│   │   └── helpers.ts
│   ├── cli/
│   │   └── index.ts            # Admin CLI
│   └── sdk/
│       └── index.ts            # Agent SDK
├── tests/
│   ├── sdk.test.ts
│   └── validators.test.ts
├── packages/
│   ├── sdk/                    # SDK package
│   └── cli/                    # CLI package
├── docker-compose.yml
├── Dockerfile
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

## Common Development Tasks

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test sdk.test.ts

# Watch mode
npm test -- --watch

# Coverage
npm test -- --coverage
```

### Building for Production

```bash
# TypeScript compilation
npm run build

# Output goes to dist/
```

### Database Migrations

```bash
# Apply schema to Supabase
npm run migrate

# This prints instructions to run schema.sql in Supabase SQL Editor
```

### Linting & Formatting

```bash
# Check for errors
npm run lint

# Auto-fix formatting
npm run format
```

### Running with Docker

```bash
# Build image
docker build -t agentsbank .

# Run container
docker run -p 3000:3000 --env-file .env agentsbank

# Or use docker-compose (includes Redis)
docker-compose up

# Stop containers
docker-compose down
```

## API Development

### Adding a New Endpoint

1. **Create validator schema** in `src/validators/schemas.ts`:
```typescript
export const mySchema = z.object({
  field: z.string(),
});
```

2. **Create route handler** in `src/routes/myroute.ts`:
```typescript
import { validateRequest } from '../middleware/validation.js';
import { mySchema } from '../validators/schemas.js';

router.post('/', validateRequest(mySchema), async (req, res) => {
  // Implementation
});
```

3. **Add middleware if needed** (auth, rate limiting, etc.)

4. **Register route** in `src/index.ts`:
```typescript
app.use('/api/myroute', myRouter);
```

5. **Document with JSDoc comments** for Swagger

### Testing Endpoints

```bash
# Using curl
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "TestPassword123!"
  }'

# Using Python requests
import requests

response = requests.post('http://localhost:3000/api/auth/register', json={
    'username': 'testuser',
    'email': 'test@example.com',
    'password': 'TestPassword123!'
})
print(response.json())
```

## Agent SDK Development

### Using SDK locally

```typescript
import { AgentsBankSDK } from './src/sdk/index';

const sdk = new AgentsBankSDK({
  apiUrl: 'http://localhost:3000/api',
  agentUsername: 'my_agent',
  agentPassword: 'password',
});

// Login
const token = await sdk.login();

// Create wallet
const wallet = await sdk.createWallet('ethereum');

// Send transaction
const tx = await sdk.sendTransaction(
  wallet.wallet_id,
  '0x...',
  '0.1'
);

// Wait for confirmation
const confirmed = await sdk.waitForConfirmation(tx.tx_id);
```

### Publishing SDK

```bash
cd packages/sdk
npm publish
```

## CLI Admin Tool Development

### Using CLI locally

```bash
# List agents
npx ts-node src/cli/index.ts agent:list

# Suspend agent
npx ts-node src/cli/index.ts agent:suspend <agent-id>

# Show statistics
npx ts-node src/cli/index.ts stats
```

### Testing CLI

```typescript
// Add commands in src/cli/index.ts
program
  .command('my-command [arg]')
  .action(async (arg) => {
    // Implementation
  });
```

## Debugging

### Enable verbose logging

```bash
LOG_LEVEL=debug npm run dev
```

### Use VS Code debugger

Create `.vscode/launch.json`:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Launch Dev",
      "program": "${workspaceFolder}/node_modules/.bin/tsx",
      "args": ["src/index.ts"],
      "restart": true,
      "console": "integratedTerminal"
    }
  ]
}
```

Then press F5 to debug.

### Inspect Database

```typescript
// In any service
import { supabase } from '../config/supabase.js';

const { data, error } = await supabase
  .from('transactions')
  .select()
  .limit(5);

console.log(data);
```

## Performance Optimization

### Redis Caching

```typescript
import redis from 'redis';

const client = redis.createClient();
const cached = await client.get('key');
```

### Database Indexes

Already created in schema.sql. Monitor with:
```sql
SELECT * FROM pg_stat_user_indexes;
```

### Query Optimization

Use `.select()` with specific columns:
```typescript
// Good
const { data } = await supabase
  .select('agent_id, agent_username')
  .from('agents');

// Avoid (loads all fields)
const { data } = await supabase.from('agents').select('*');
```

## Environment Variables Reference

| Variable | Purpose | Example |
|----------|---------|---------|
| `SUPABASE_URL` | Supabase project URL | `https://xyz.supabase.co` |
| `SUPABASE_ANON_KEY` | Public anon key | `eyJhbGc...` |
| `SUPABASE_SERVICE_KEY` | Admin/service key | `eyJhbGc...` |
| `JWT_SECRET` | JWT signing key | `min-32-chars` |
| `ETH_RPC_URL` | Ethereum RPC | `https://...` |
| `BNB_RPC_URL` | BNB Chain RPC | `https://...` |
| `REDIS_HOST` | Redis host | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `LOG_LEVEL` | Logging level | `debug\|info\|warn\|error` |

## Troubleshooting

### Port 3000 already in use

```bash
# Find process using port 3000
lsof -i :3000

# Kill process
kill -9 <PID>
```

### Supabase connection error

- Check `.env` credentials
- Verify Supabase project is active
- Check network connectivity

### Redis connection error

- Start Redis: `redis-server`
- Or skip Redis for dev (rate limiting uses memory)

### Type errors

```bash
# Clear cache and rebuild
rm -rf node_modules .turbo
npm install
npm run build
```

## Performance Monitoring

### System Metrics

```bash
curl http://localhost:3000/api/metrics/system
```

### Agent Metrics

```bash
curl http://localhost:3000/api/metrics/agent/<agent-id>
```

### Daily Statistics

```bash
curl "http://localhost:3000/api/metrics/daily-stats?days=30"
```

## Code Quality

### ESLint

```bash
npm run lint          # Check
npm run lint -- --fix # Fix
```

### Prettier

```bash
npm run format
```

### Type Checking

```bash
npx tsc --noEmit
```

## Next Steps

- [ ] Implement private key vault integration (Vault/KMS)
- [ ] Add WebSocket support for real-time updates
- [ ] Create agent marketplace UI
- [ ] Multi-signature wallet support
- [ ] Advanced reputation algorithm
- [ ] Fiat on/off ramps
- [ ] Agent swarms (team wallets)

---

**Happy developing! 🚀**
