import express, { Request, Response } from 'express';
import { TransactionService } from '../services/transaction.js';
import { TransactionProcessor } from '../services/transactionProcessor.js';
import { WalletService } from '../services/wallet.js';
import { AgentService } from '../services/agent.js';
import { authMiddleware, requireAgent } from '../middleware/auth.js';
import { HTTP_STATUS, TOKEN_CONTRACTS, TOKEN_DECIMALS } from '../constants.js';
import { logger } from '../utils/logger.js';

export const transactionRouter = express.Router();

/**
 * POST /api/transactions
 * Create and execute transaction with full fee breakdown
 */
transactionRouter.post('/', authMiddleware, requireAgent, async (req: Request, res: Response) => {
  try {
    const { wallet_id, to_address, amount, currency = 'ETH', type = 'transfer' } = req.body;

    if (!wallet_id || !to_address || !amount) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: 'Missing required fields: wallet_id, to_address, amount',
      });
    }

    const wallet = await WalletService.getWallet(wallet_id);

    // Verify ownership
    if (wallet.agent_id !== req.agent!.sub) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        error: 'Not authorized to use this wallet',
      });
    }

    // Process transaction with full fee calculation and quota checking
    const result = await TransactionProcessor.processTransaction(
      req.agent!.sub,
      wallet_id,
      to_address,
      amount,
      currency,
      type
    );

    // Log action
    await AgentService.logAction(
      req.agent!.sub,
      'transaction',
      result.transaction.tx_id,
      'execute',
      req.agent!.username,
      'agent',
      {
        wallet_id,
        to_address,
        amount,
        currency,
        fees: result.fees,
      },
      req.ip
    );

    res.status(HTTP_STATUS.CREATED).json({
      tx_id: result.transaction.tx_id,
      tx_hash: result.execution.tx_hash,
      status: result.execution.status,
      
      // Amount details
      amount: result.fees.amount,
      amount_usd: result.fees.amount_usd,
      currency: result.fees.currency,
      chain: result.fees.chain,
      
      // Addresses
      from_address: result.transaction.from_address,
      to_address: result.transaction.to_address,
      
      // Fee breakdown
      fees: {
        chain_fee: result.fees.chain_fee,
        chain_fee_currency: result.fees.chain_fee_currency,
        chain_fee_usd: result.fees.chain_fee_usd,
        
        bank_fee: result.fees.bank_fee,
        bank_fee_currency: result.fees.bank_fee_currency,
        bank_fee_usd: result.fees.bank_fee_usd,
        bank_fee_percentage: result.fees.bank_fee_percentage,
        bank_fee_tier: result.fees.bank_fee_tier,
        
        total_fee_usd: result.fees.total_fee_usd,
      },
      
      // Totals
      total_deducted: result.fees.total_deducted,
      total_deducted_usd: result.fees.total_deducted_usd,
      
      // Quota status after transaction
      quota: {
        daily_transactions_remaining: result.quota.daily_transaction_count,
        daily_volume_remaining_usd: result.quota.daily_limit_remaining_usd.toFixed(2),
        monthly_volume_remaining_usd: result.quota.monthly_limit_remaining_usd.toFixed(2),
        fee_tier: result.quota.fee_tier,
      },
      
      // Exchange rates used
      exchange_rates: result.fees.exchange_rates,
      
      timestamp: result.transaction.timestamp,
    });
  } catch (error: any) {
    logger.error('Failed to create transaction:', error);
    
    // Check if it's a quota/guardrail rejection
    if (error.message.includes('rejected')) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({ error: error.message });
    }
    
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({ error: error.message });
  }
});

/**
 * POST /api/transactions/estimate
 * Estimate fees before executing transaction
 */
transactionRouter.post('/estimate', authMiddleware, requireAgent, async (req: Request, res: Response) => {
  try {
    const { wallet_id, to_address, amount, currency = 'ETH' } = req.body;

    if (!wallet_id || !to_address || !amount) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: 'Missing required fields: wallet_id, to_address, amount',
      });
    }

    const wallet = await WalletService.getWallet(wallet_id);

    if (wallet.agent_id !== req.agent!.sub) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        error: 'Not authorized to use this wallet',
      });
    }

    // Calculate fees without executing
    const fees = await TransactionProcessor.calculateFees(
      req.agent!.sub,
      wallet_id,
      to_address,
      amount,
      currency
    );

    // Get quota status
    const quota = await TransactionProcessor.getQuotaStatus(req.agent!.sub);

    // Get minimum requirements
    const minimum = TransactionProcessor.getMinimumTransaction(wallet.chain, currency);
    
    // Validate if transaction would be allowed (including minimums)
    const validation = await TransactionProcessor.validateTransaction(
      req.agent!.sub,
      amount,
      currency,
      wallet.chain
    );

    res.status(HTTP_STATUS.OK).json({
      can_proceed: validation.valid,
      rejection_reason: validation.reason,
      
      // Minimum requirements for this chain
      minimums: {
        minimum_usd: minimum.minimum_usd,
        minimum_native: minimum.minimum_native,
        recommended_usd: minimum.recommended_usd,
        currency: minimum.currency,
      },
      
      // Amount details
      amount: fees.amount,
      amount_usd: fees.amount_usd,
      currency: fees.currency,
      chain: fees.chain,
      
      // Fee breakdown
      fees: {
        chain_fee: fees.chain_fee,
        chain_fee_currency: fees.chain_fee_currency,
        chain_fee_usd: fees.chain_fee_usd,
        
        bank_fee: fees.bank_fee,
        bank_fee_currency: fees.bank_fee_currency,
        bank_fee_usd: fees.bank_fee_usd,
        bank_fee_percentage: fees.bank_fee_percentage,
        bank_fee_tier: fees.bank_fee_tier,
        
        total_fee_usd: fees.total_fee_usd,
      },
      
      // What will be deducted
      total_deducted: fees.total_deducted,
      total_deducted_usd: fees.total_deducted_usd,
      
      // Current quota status
      quota: {
        daily_transaction_count: quota.daily_transaction_count,
        daily_volume_usd: quota.daily_volume_usd.toFixed(2),
        daily_limit_remaining_usd: quota.daily_limit_remaining_usd.toFixed(2),
        monthly_transaction_count: quota.monthly_transaction_count,
        monthly_volume_usd: quota.monthly_volume_usd.toFixed(2),
        monthly_limit_remaining_usd: quota.monthly_limit_remaining_usd.toFixed(2),
        max_transaction_usd: quota.max_transaction_usd,
        fee_tier: quota.fee_tier,
        fee_percentage: quota.fee_percentage,
      },
      
      // Exchange rates
      exchange_rates: fees.exchange_rates,
    });
  } catch (error: any) {
    logger.error('Failed to estimate transaction:', error);
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({ error: error.message });
  }
});

/**
 * GET /api/transactions/quota
 * Get current quota status for agent
 */
transactionRouter.get('/quota', authMiddleware, requireAgent, async (req: Request, res: Response) => {
  try {
    const quota = await TransactionProcessor.getQuotaStatus(req.agent!.sub);

    res.status(HTTP_STATUS.OK).json({
      agent_id: quota.agent_id,
      
      daily: {
        transaction_count: quota.daily_transaction_count,
        volume_usd: quota.daily_volume_usd.toFixed(2),
        limit_remaining_usd: quota.daily_limit_remaining_usd.toFixed(2),
      },
      
      monthly: {
        transaction_count: quota.monthly_transaction_count,
        volume_usd: quota.monthly_volume_usd.toFixed(2),
        limit_remaining_usd: quota.monthly_limit_remaining_usd.toFixed(2),
      },
      
      limits: {
        max_transaction_usd: quota.max_transaction_usd,
      },
      
      fee_tier: quota.fee_tier,
      fee_percentage: `${quota.fee_percentage.toFixed(2)}%`,
      
      can_transact: quota.can_transact,
      rejection_reason: quota.rejection_reason,
    });
  } catch (error: any) {
    logger.error('Failed to get quota:', error);
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({ error: error.message });
  }
});

/**
 * GET /api/transactions/minimums
 * Get minimum transaction requirements for all chains
 */
transactionRouter.get('/minimums', async (_req: Request, res: Response) => {
  try {
    const chains = ['ethereum', 'bsc', 'solana', 'bitcoin'];
    const minimums: Record<string, any> = {};
    
    for (const chain of chains) {
      const nativeToken = chain === 'ethereum' ? 'ETH' 
        : chain === 'bsc' ? 'BNB'
        : chain === 'solana' ? 'SOL'
        : 'BTC';
      
      minimums[chain] = TransactionProcessor.getMinimumTransaction(chain, nativeToken);
    }
    
    res.status(HTTP_STATUS.OK).json({
      minimums,
      note: 'Transactions below minimum will be rejected. Recommended amounts ensure good UX after fees.',
    });
  } catch (error: any) {
    logger.error('Failed to get minimums:', error);
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({ error: error.message });
  }
});

/**
 * GET /api/transactions/:txId
 * Get transaction details
 */
transactionRouter.get('/:txId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const tx = await TransactionService.getTransaction(req.params.txId);

    const wallet = await WalletService.getWallet(tx.wallet_id);

    // Only agent owner can view
    if (req.agent?.sub !== wallet.agent_id) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        error: 'Not authorized',
      });
    }

    res.status(HTTP_STATUS.OK).json({
      tx_id: tx.tx_id,
      wallet_id: tx.wallet_id,
      type: tx.type,
      amount: tx.amount,
      currency: tx.currency,
      from_address: tx.from_address,
      to_address: tx.to_address,
      tx_hash: tx.tx_hash,
      status: tx.status,
      fee: tx.fee,
      timestamp: tx.timestamp,
    });
  } catch (error: any) {
    logger.error('Failed to get transaction:', error);
    res.status(HTTP_STATUS.NOT_FOUND).json({ error: error.message });
  }
});

/**
 * GET /api/transactions/wallet/:walletId
 * Get transactions for wallet
 */
transactionRouter.get('/wallet/:walletId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const wallet = await WalletService.getWallet(req.params.walletId);

    if (req.agent?.sub !== wallet.agent_id) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        error: 'Not authorized',
      });
    }

    const status = req.query.status as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 500);

    const transactions = await TransactionService.getWalletTransactions(
      req.params.walletId,
      status,
      limit
    );

    res.status(HTTP_STATUS.OK).json({
      wallet_id: req.params.walletId,
      transactions,
      count: transactions.length,
    });
  } catch (error: any) {
    logger.error('Failed to get transactions:', error);
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({ error: error.message });
  }
});

/**
 * GET /api/transactions/wallet/:walletId/stats
 * Get transaction statistics
 */
transactionRouter.get(
  '/wallet/:walletId/stats',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const wallet = await WalletService.getWallet(req.params.walletId);

      if (req.agent?.sub !== wallet.agent_id) {
        return res.status(HTTP_STATUS.FORBIDDEN).json({
          error: 'Not authorized',
        });
      }

      const days = Math.min(parseInt(req.query.days as string) || 30, 365);
      const stats = await TransactionService.getStats(req.params.walletId, days);

      res.status(HTTP_STATUS.OK).json({
        wallet_id: req.params.walletId,
        period_days: days,
        ...stats,
      });
    } catch (error: any) {
      logger.error('Failed to get statistics:', error);
      res.status(HTTP_STATUS.INTERNAL_ERROR).json({ error: error.message });
    }
  }
);
