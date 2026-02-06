import express, { Request, Response } from 'express';
import { authMiddleware, requireHuman } from '../middleware/auth.js';
import { getSystemMetrics, getAgentMetrics, getDailyStats } from '../services/metrics.js';
import { HTTP_STATUS } from '../constants.js';
import { logger } from '../utils/logger.js';

export const metricsRouter = express.Router();

/**
 * GET /api/metrics/system
 * Get overall system metrics (human only)
 */
metricsRouter.get('/system', authMiddleware, requireHuman, async (_req: Request, res: Response) => {
  try {
    const metrics = await getSystemMetrics();
    res.status(HTTP_STATUS.OK).json(metrics);
  } catch (error: any) {
    logger.error('Failed to get system metrics:', error);
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({ error: error.message });
  }
});

/**
 * GET /api/metrics/agent/:agentId
 * Get agent-specific metrics
 */
metricsRouter.get('/agent/:agentId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const metrics = await getAgentMetrics(req.params.agentId);
    res.status(HTTP_STATUS.OK).json(metrics);
  } catch (error: any) {
    logger.error('Failed to get agent metrics:', error);
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({ error: error.message });
  }
});

/**
 * GET /api/metrics/daily-stats
 * Get daily statistics
 */
metricsRouter.get(
  '/daily-stats',
  authMiddleware,
  requireHuman,
  async (req: Request, res: Response) => {
    try {
      const days = Math.min(parseInt(req.query.days as string) || 30, 365);
      const stats = await getDailyStats(days);
      res.status(HTTP_STATUS.OK).json({ days, stats });
    } catch (error: any) {
      logger.error('Failed to get daily stats:', error);
      res.status(HTTP_STATUS.INTERNAL_ERROR).json({ error: error.message });
    }
  }
);
