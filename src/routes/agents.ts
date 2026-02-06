import express, { Request, Response } from 'express';
import { AgentService } from '../services/agent.js';
import { AuthService } from '../services/auth.js';
import { WalletService } from '../services/wallet.js';
import { authMiddleware, requireHuman } from '../middleware/auth.js';
import { HTTP_STATUS } from '../constants.js';
import { logger } from '../utils/logger.js';

export const agentRouter = express.Router();

/**
 * GET /api/agents
 * List all agents for authenticated human
 */
agentRouter.get('/', authMiddleware, requireHuman, async (req: Request, res: Response) => {
  try {
    const agents = await AgentService.listAgents(req.user!.sub);

    res.status(HTTP_STATUS.OK).json({
      agents: agents.map((agent) => ({
        agent_id: agent.agent_id,
        first_name: agent.first_name,
        last_name: agent.last_name,
        agent_username: agent.agent_username,
        did: agent.did,
        reputation_score: agent.reputation_score,
        status: agent.status,
        created_at: agent.created_at,
      })),
    });
  } catch (error: any) {
    logger.error('Failed to list agents:', error);
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({ error: error.message });
  }
});

/**
 * GET /api/agents/:agentId
 * Get agent details
 */
agentRouter.get('/:agentId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const agent = await AgentService.getAgent(req.params.agentId);

    // Only owner or the agent themselves can view details
    if (req.user?.sub !== agent.human_id && req.agent?.sub !== agent.agent_id) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        error: 'Not authorized to view this agent',
      });
    }

    res.status(HTTP_STATUS.OK).json({
      agent_id: agent.agent_id,
      first_name: agent.first_name,
      last_name: agent.last_name,
      agent_username: agent.agent_username,
      did: agent.did,
      reputation_score: agent.reputation_score,
      status: agent.status,
      guardrails: agent.guardrails,
      created_at: agent.created_at,
    });
  } catch (error: any) {
    logger.error('Failed to get agent:', error);
    res.status(HTTP_STATUS.NOT_FOUND).json({ error: error.message });
  }
});

/**
 * POST /api/agents/:agentId/guardrails
 * Update agent guardrails
 */
agentRouter.post(
  '/:agentId/guardrails',
  authMiddleware,
  requireHuman,
  async (req: Request, res: Response) => {
    try {
      const { guardrails } = req.body;

      if (!guardrails) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          error: 'Missing guardrails',
        });
      }

      const agent = await AgentService.getAgent(req.params.agentId);

      // Only owner can update guardrails
      if (req.user!.sub !== agent.human_id) {
        return res.status(HTTP_STATUS.FORBIDDEN).json({
          error: 'Not authorized to update guardrails',
        });
      }

      const updated = await AgentService.updateGuardrails(req.params.agentId, guardrails);

      await AgentService.logAction(
        req.params.agentId,
        'agent',
        req.params.agentId,
        'update_guardrails',
        req.user!.username,
        'human',
        { guardrails },
        req.ip
      );

      res.status(HTTP_STATUS.OK).json({
        agent_id: updated.agent_id,
        guardrails: updated.guardrails,
      });
    } catch (error: any) {
      logger.error('Failed to update guardrails:', error);
      res.status(HTTP_STATUS.INTERNAL_ERROR).json({ error: error.message });
    }
  }
);

/**
 * POST /api/agents/:agentId/suspend
 * Suspend agent
 */
agentRouter.post(
  '/:agentId/suspend',
  authMiddleware,
  requireHuman,
  async (req: Request, res: Response) => {
    try {
      const agent = await AgentService.getAgent(req.params.agentId);

      // Only owner can suspend
      if (req.user!.sub !== agent.human_id) {
        return res.status(HTTP_STATUS.FORBIDDEN).json({
          error: 'Not authorized to suspend this agent',
        });
      }

      const suspended = await AgentService.suspendAgent(req.params.agentId);

      await AgentService.logAction(
        req.params.agentId,
        'agent',
        req.params.agentId,
        'suspend',
        req.user!.username,
        'human',
        {},
        req.ip
      );

      res.status(HTTP_STATUS.OK).json({
        agent_id: suspended.agent_id,
        status: suspended.status,
      });
    } catch (error: any) {
      logger.error('Failed to suspend agent:', error);
      res.status(HTTP_STATUS.INTERNAL_ERROR).json({ error: error.message });
    }
  }
);

/**
 * POST /api/agents/:agentId/regenerate-key
 * Regenerate agent API key
 */
agentRouter.post(
  '/:agentId/regenerate-key',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const agent = await AgentService.getAgent(req.params.agentId);

      // Only owner or the agent can regenerate
      if (req.user?.sub !== agent.human_id && req.agent?.sub !== agent.agent_id) {
        return res.status(HTTP_STATUS.FORBIDDEN).json({
          error: 'Not authorized to regenerate key',
        });
      }

      const newKey = await AuthService.regenerateApiKey(req.params.agentId);

      res.status(HTTP_STATUS.OK).json({
        api_key: newKey,
      });
    } catch (error: any) {
      logger.error('Failed to regenerate API key:', error);
      res.status(HTTP_STATUS.INTERNAL_ERROR).json({ error: error.message });
    }
  }
);

/**
 * GET /api/agents/:agentId/wallets
 * List agent wallets
 */
agentRouter.get('/:agentId/wallets', authMiddleware, async (req: Request, res: Response) => {
  try {
    const agent = await AgentService.getAgent(req.params.agentId);

    // Only owner or agent can view wallets
    if (req.user?.sub !== agent.human_id && req.agent?.sub !== agent.agent_id) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        error: 'Not authorized to view wallets',
      });
    }

    const wallets = await WalletService.listWallets(req.params.agentId);

    res.status(HTTP_STATUS.OK).json({
      wallets: wallets.map((w) => ({
        wallet_id: w.wallet_id,
        chain: w.chain,
        address: w.address,
        type: w.type,
        balance: w.balance,
        created_at: w.created_at,
      })),
    });
  } catch (error: any) {
    logger.error('Failed to list wallets:', error);
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({ error: error.message });
  }
});
