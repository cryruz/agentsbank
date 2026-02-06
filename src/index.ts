import express from 'express';
import { config } from 'dotenv';

// Load env vars FIRST before importing anything that uses them
config();

import helmet from 'helmet';
import cors from 'cors';
import { initSupabase } from './config/supabase.js';
import { authRouter } from './routes/auth.js';
import { agentRouter } from './routes/agents.js';
import { walletRouter } from './routes/wallets.js';
import { transactionRouter } from './routes/transactions.js';
import { metricsRouter } from './routes/metrics.js';
import { docsRouter } from './routes/docs.js';
import { catalogueRouter } from './routes/catalogue.js';
import { adminRouter } from './routes/admin.js';
import { errorHandler } from './middleware/errorHandler.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import { logger } from './utils/logger.js';
import { startPollingJob } from './jobs/transactionPoller.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(apiLimiter);

// Initialize Supabase
initSupabase();

// Documentation
app.use('/docs', docsRouter);

// Routes
app.use('/api/auth', authRouter);
app.use('/api/agents', agentRouter);
app.use('/api/wallets', walletRouter);
app.use('/api/transactions', transactionRouter);
app.use('/api/metrics', metricsRouter);
app.use('/api/catalogue', catalogueRouter);
app.use('/api/admin', adminRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Error handling
app.use(errorHandler);

// Start server
const server = app.listen(PORT, () => {
  logger.info(`🚀 AgentsBank.ai running on port ${PORT}`);
  logger.info(`📚 API Docs: http://localhost:${PORT}/docs`);

  // Start background jobs
  startPollingJob(30000); // Poll every 30 seconds
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

export default app;
