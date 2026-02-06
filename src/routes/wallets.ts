import express, { Request, Response } from 'express';
import { WalletService } from '../services/wallet.js';
import { AgentService } from '../services/agent.js';
import { authMiddleware, requireAgent } from '../middleware/auth.js';
import { HTTP_STATUS } from '../constants.js';
import { logger } from '../utils/logger.js';

export const walletRouter = express.Router();

/**
 * POST /api/wallets
 * Create new custodial wallet for agent
 * All wallets are custodial - server manages keys, agents interact via API
 */
walletRouter.post('/', authMiddleware, requireAgent, async (req: Request, res: Response) => {
  try {
    const { chain } = req.body;

    if (!chain) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: 'Missing required field: chain',
      });
    }

    if (!['ethereum', 'bsc', 'solana', 'bitcoin'].includes(chain)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: 'Invalid chain. Supported: ethereum, bsc, solana, bitcoin',
      });
    }

    // Route to appropriate wallet creation method based on chain type
    let wallet;
    if (chain === 'bitcoin') {
      wallet = await WalletService.createBitcoinWallet(req.agent!.sub);
    } else if (chain === 'solana') {
      wallet = await WalletService.createSolanaWallet(req.agent!.sub);
    } else {
      // EVM chains (ethereum, bsc)
      wallet = await WalletService.createCustodialWallet(req.agent!.sub, chain);
    }

    await AgentService.logAction(
      req.agent!.sub,
      'wallet',
      wallet.wallet_id,
      'create',
      req.agent!.username,
      'agent',
      { chain, type: 'custodial' }
    );

    res.status(HTTP_STATUS.CREATED).json({
      wallet_id: wallet.wallet_id,
      agent_id: wallet.agent_id,
      chain: wallet.chain,
      address: wallet.address,
      type: wallet.type,
      created_at: wallet.created_at,
    });
  } catch (error: any) {
    logger.error('Failed to create wallet:', error);
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({ error: error.message });
  }
});

/**
 * POST /api/wallets/:walletId/send
 * Request server to sign and send a transaction
 * Agent provides details, server handles signing with encrypted keys
 */
walletRouter.post('/:walletId/send', authMiddleware, requireAgent, async (req: Request, res: Response) => {
  try {
    const wallet = await WalletService.getWallet(req.params.walletId);

    // Only owner agent can send transactions
    if (req.agent?.sub !== wallet.agent_id) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        error: 'Not authorized to send from this wallet',
      });
    }

    const { to_address, amount } = req.body;

    if (!to_address || !amount) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: 'Missing required fields: to_address, amount',
      });
    }

    // Server signs and sends transaction (agent never sees private key)
    const result = await WalletService.signAndSendTransaction(
      req.params.walletId,
      to_address,
      amount,
      wallet.chain
    );

    await AgentService.logAction(
      req.agent!.sub,
      'transaction',
      result.txHash,
      'send',
      req.agent!.username,
      'agent',
      { wallet_id: req.params.walletId, to_address, amount, chain: wallet.chain }
    );

    res.status(HTTP_STATUS.OK).json({
      tx_hash: result.txHash,
      status: result.status,
      from_address: wallet.address,
      to_address,
      amount,
      chain: wallet.chain,
    });
  } catch (error: any) {
    logger.error('Failed to send transaction:', error);
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({ error: error.message });
  }
});

/**
 * POST /api/wallets/:walletId/sign-message
 * Request server to sign a message (for authentication, etc.)
 */
walletRouter.post('/:walletId/sign-message', authMiddleware, requireAgent, async (req: Request, res: Response) => {
  try {
    const wallet = await WalletService.getWallet(req.params.walletId);

    if (req.agent?.sub !== wallet.agent_id) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        error: 'Not authorized',
      });
    }

    const { message } = req.body;

    if (!message) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: 'Missing required field: message',
      });
    }

    const signature = await WalletService.signMessage(req.params.walletId, message);

    res.status(HTTP_STATUS.OK).json({
      wallet_id: req.params.walletId,
      address: wallet.address,
      message,
      signature,
    });
  } catch (error: any) {
    logger.error('Failed to sign message:', error);
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({ error: error.message });
  }
});

/**
 * GET /api/wallets/:walletId
 * Get wallet details
 */
walletRouter.get('/:walletId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const wallet = await WalletService.getWallet(req.params.walletId);

    // Only owner agent can view wallet details
    if (req.agent?.sub !== wallet.agent_id) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        error: 'Not authorized to view this wallet',
      });
    }

    res.status(HTTP_STATUS.OK).json({
      wallet_id: wallet.wallet_id,
      agent_id: wallet.agent_id,
      chain: wallet.chain,
      address: wallet.address,
      type: wallet.type,
      balance: wallet.balance,
      created_at: wallet.created_at,
    });
  } catch (error: any) {
    logger.error('Failed to get wallet:', error);
    res.status(HTTP_STATUS.NOT_FOUND).json({ error: error.message });
  }
});

/**
 * GET /api/wallets/:walletId/balance
 * Fetch and update wallet balance from blockchain
 */
walletRouter.get('/:walletId/balance', authMiddleware, async (req: Request, res: Response) => {
  try {
    const wallet = await WalletService.getWallet(req.params.walletId);

    // Only owner agent can fetch balance
    if (req.agent?.sub !== wallet.agent_id) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        error: 'Not authorized',
      });
    }

    const balance = await WalletService.fetchBalance(wallet.address, wallet.chain);

    // Update balance in DB
    await WalletService.updateBalance(req.params.walletId, {
      ...wallet.balance,
      native: balance,
    });

    res.status(HTTP_STATUS.OK).json({
      wallet_id: req.params.walletId,
      chain: wallet.chain,
      address: wallet.address,
      balance: {
        ...wallet.balance,
        native: balance,
      },
    });
  } catch (error: any) {
    logger.error('Failed to fetch balance:', error);
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({ error: error.message });
  }
});

/**
 * GET /api/wallets/:walletId/estimate-gas
 * Estimate gas for transaction
 */
walletRouter.get('/:walletId/estimate-gas', authMiddleware, async (req: Request, res: Response) => {
  try {
    const wallet = await WalletService.getWallet(req.params.walletId);
    const { to_address, amount } = req.query;

    if (!to_address || !amount) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: 'Missing required query parameters: to_address, amount',
      });
    }

    const gasCost = await WalletService.estimateGas(
      wallet.chain,
      to_address as string,
      amount as string
    );

    res.status(HTTP_STATUS.OK).json({
      chain: wallet.chain,
      to_address,
      amount,
      estimated_gas: gasCost,
    });
  } catch (error: any) {
    logger.error('Failed to estimate gas:', error);
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({ error: error.message });
  }
});

/**
 * GET /api/wallets/:walletId/history
 * Get wallet transaction history
 */
walletRouter.get(
  '/:walletId/history',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const wallet = await WalletService.getWallet(req.params.walletId);

      if (req.agent?.sub !== wallet.agent_id) {
        return res.status(HTTP_STATUS.FORBIDDEN).json({
          error: 'Not authorized',
        });
      }

      const limit = Math.min(parseInt(req.query.limit as string) || 50, 500);
      const history = await WalletService.getTransactionHistory(req.params.walletId, limit);

      res.status(HTTP_STATUS.OK).json({
        wallet_id: req.params.walletId,
        transactions: history,
      });
    } catch (error: any) {
      logger.error('Failed to get transaction history:', error);
      res.status(HTTP_STATUS.INTERNAL_ERROR).json({ error: error.message });
    }
  }
);
