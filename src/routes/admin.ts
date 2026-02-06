import express, { Request, Response } from 'express';
import { FeeCollector } from '../services/feeCollector.js';
import { authMiddleware, requireHuman } from '../middleware/auth.js';
import { HTTP_STATUS } from '../constants.js';
import { logger } from '../utils/logger.js';

export const adminRouter = express.Router();

// All admin routes require human (admin) authentication
adminRouter.use(authMiddleware);
adminRouter.use(requireHuman);

/**
 * GET /api/admin/fees/pending
 * Get summary of pending fees ready for collection
 */
adminRouter.get('/fees/pending', async (req: Request, res: Response) => {
  try {
    const summary = await FeeCollector.getPendingFeesSummary();
    
    const totalPendingUsd = summary.reduce((sum, s) => sum + s.total_fees_usd, 0);
    const readyForSweep = summary.filter(s => s.ready_for_sweep);
    
    res.status(HTTP_STATUS.OK).json({
      total_pending_usd: totalPendingUsd.toFixed(2),
      chains: summary,
      ready_for_sweep: readyForSweep.length,
      summary: `$${totalPendingUsd.toFixed(2)} pending across ${summary.length} chain/currency pairs`,
    });
  } catch (error: any) {
    logger.error('Failed to get pending fees:', error);
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({ error: error.message });
  }
});

/**
 * POST /api/admin/fees/collect
 * Manually trigger fee collection for a specific chain
 */
adminRouter.post('/fees/collect', async (req: Request, res: Response) => {
  try {
    const { chain, currency } = req.body;
    
    if (!chain || !currency) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: 'Missing required fields: chain, currency',
      });
    }
    
    const batch = await FeeCollector.executeFeeCollection(chain, currency);
    
    if (!batch) {
      return res.status(HTTP_STATUS.OK).json({
        message: 'No fees to collect or treasury not configured',
        collected: false,
      });
    }
    
    res.status(HTTP_STATUS.OK).json({
      message: 'Fee collection completed',
      collected: true,
      batch,
    });
  } catch (error: any) {
    logger.error('Failed to collect fees:', error);
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({ error: error.message });
  }
});

/**
 * POST /api/admin/fees/collect-all
 * Force collect all pending fees across all chains
 */
adminRouter.post('/fees/collect-all', async (req: Request, res: Response) => {
  try {
    const batches = await FeeCollector.forceCollectAll();
    
    const totalCollected = batches.reduce(
      (sum, b) => sum + parseFloat(b.net_collected_usd || '0'),
      0
    );
    
    res.status(HTTP_STATUS.OK).json({
      message: `Collected fees from ${batches.length} batches`,
      total_collected_usd: totalCollected.toFixed(2),
      batches,
    });
  } catch (error: any) {
    logger.error('Failed to force collect fees:', error);
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({ error: error.message });
  }
});

/**
 * GET /api/admin/fees/history
 * Get fee collection history
 */
adminRouter.get('/fees/history', async (req: Request, res: Response) => {
  try {
    const chain = req.query.chain as string | undefined;
    const days = parseInt(req.query.days as string) || 30;
    
    const history = await FeeCollector.getCollectionHistory(chain, days);
    const totals = await FeeCollector.getTotalFeesCollected(chain);
    
    res.status(HTTP_STATUS.OK).json({
      period_days: days,
      chain: chain || 'all',
      totals: {
        total_collected_usd: totals.total_usd.toFixed(2),
        net_collected_usd: totals.net_usd.toFixed(2),
        gas_spent_usd: totals.gas_spent_usd.toFixed(2),
        efficiency: totals.total_usd > 0 
          ? ((totals.net_usd / totals.total_usd) * 100).toFixed(1) + '%'
          : 'N/A',
      },
      batches: history,
    });
  } catch (error: any) {
    logger.error('Failed to get fee history:', error);
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({ error: error.message });
  }
});

/**
 * GET /api/admin/fees/stats
 * Get fee collection statistics
 */
adminRouter.get('/fees/stats', async (req: Request, res: Response) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);
    
    const [pending, todayTotals, monthTotals, allTimeTotals] = await Promise.all([
      FeeCollector.getPendingFeesSummary(),
      FeeCollector.getTotalFeesCollected(undefined, today),
      FeeCollector.getTotalFeesCollected(undefined, thisMonth),
      FeeCollector.getTotalFeesCollected(),
    ]);
    
    const pendingUsd = pending.reduce((sum, p) => sum + p.total_fees_usd, 0);
    
    res.status(HTTP_STATUS.OK).json({
      pending: {
        total_usd: pendingUsd.toFixed(2),
        chains: pending.length,
        ready_for_sweep: pending.filter(p => p.ready_for_sweep).length,
      },
      today: {
        collected_usd: todayTotals.total_usd.toFixed(2),
        net_usd: todayTotals.net_usd.toFixed(2),
        gas_spent_usd: todayTotals.gas_spent_usd.toFixed(2),
      },
      this_month: {
        collected_usd: monthTotals.total_usd.toFixed(2),
        net_usd: monthTotals.net_usd.toFixed(2),
        gas_spent_usd: monthTotals.gas_spent_usd.toFixed(2),
      },
      all_time: {
        collected_usd: allTimeTotals.total_usd.toFixed(2),
        net_usd: allTimeTotals.net_usd.toFixed(2),
        gas_spent_usd: allTimeTotals.gas_spent_usd.toFixed(2),
        efficiency: allTimeTotals.total_usd > 0
          ? ((allTimeTotals.net_usd / allTimeTotals.total_usd) * 100).toFixed(1) + '%'
          : 'N/A',
      },
    });
  } catch (error: any) {
    logger.error('Failed to get fee stats:', error);
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({ error: error.message });
  }
});
