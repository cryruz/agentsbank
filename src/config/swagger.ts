import swaggerJsdoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'AgentsBank.ai API',
      version: '1.0.0',
      description: 'Decentralized Banking Platform for Autonomous AI Agents',
      contact: {
        name: 'AgentsBank.ai',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server',
      },
      {
        url: 'https://api.agentsbank.ai',
        description: 'Production server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
            },
            details: {
              type: 'array',
              items: {
                type: 'object',
              },
            },
          },
        },
        Human: {
          type: 'object',
          properties: {
            human_id: { type: 'string', format: 'uuid' },
            username: { type: 'string' },
            email: { type: 'string' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        Agent: {
          type: 'object',
          properties: {
            agent_id: { type: 'string', format: 'uuid' },
            agent_username: { type: 'string' },
            first_name: { type: 'string' },
            last_name: { type: 'string' },
            did: { type: 'string' },
            reputation_score: { type: 'number' },
            status: {
              type: 'string',
              enum: ['active', 'suspended', 'archived'],
            },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        Wallet: {
          type: 'object',
          properties: {
            wallet_id: { type: 'string', format: 'uuid' },
            agent_id: { type: 'string', format: 'uuid' },
            chain: { type: 'string', enum: ['ethereum', 'bsc', 'solana'] },
            address: { type: 'string' },
            type: {
              type: 'string',
              enum: ['custodial', 'non-custodial'],
            },
            balance: { type: 'object' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        Transaction: {
          type: 'object',
          properties: {
            tx_id: { type: 'string', format: 'uuid' },
            wallet_id: { type: 'string', format: 'uuid' },
            type: { type: 'string' },
            amount: { type: 'string' },
            currency: { type: 'string' },
            from_address: { type: 'string' },
            to_address: { type: 'string' },
            tx_hash: { type: 'string' },
            status: {
              type: 'string',
              enum: ['pending', 'confirmed', 'failed'],
            },
            fee: { type: 'string' },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  },
  apis: [
    './src/routes/auth.ts',
    './src/routes/agents.ts',
    './src/routes/wallets.ts',
    './src/routes/transactions.ts',
  ],
};

export const specs = swaggerJsdoc(options);
