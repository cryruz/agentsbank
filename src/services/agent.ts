import { supabase, type Agent } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

export class AgentService {
  /**
   * Get agent by ID
   */
  static async getAgent(agentId: string): Promise<Agent> {
    const { data, error } = await supabase
      .from('agents')
      .select()
      .eq('agent_id', agentId)
      .single();

    if (error || !data) {
      throw new Error('Agent not found');
    }

    return data;
  }

  /**
   * List all agents for a human
   */
  static async listAgents(humanId: string): Promise<Agent[]> {
    const { data, error } = await supabase
      .from('agents')
      .select()
      .eq('human_id', humanId)
      .neq('status', 'archived');

    if (error) throw error;
    return data || [];
  }

  /**
   * Update agent guardrails
   */
  static async updateGuardrails(
    agentId: string,
    guardrails: Record<string, unknown>
  ): Promise<Agent> {
    const { data, error } = await supabase
      .from('agents')
      .update({ guardrails })
      .eq('agent_id', agentId)
      .select()
      .single();

    if (error) throw error;

    logger.info(`Guardrails updated for agent ${agentId}`);
    return data;
  }

  /**
   * Update agent reputation score
   */
  static async updateReputation(agentId: string, delta: number): Promise<Agent> {
    const agent = await this.getAgent(agentId);
    const newScore = Math.max(0, agent.reputation_score + delta);

    const { data, error } = await supabase
      .from('agents')
      .update({ reputation_score: newScore })
      .eq('agent_id', agentId)
      .select()
      .single();

    if (error) throw error;

    logger.info(`Reputation updated for agent ${agentId}: ${newScore}`);
    return data;
  }

  /**
   * Suspend agent
   */
  static async suspendAgent(agentId: string): Promise<Agent> {
    const { data, error } = await supabase
      .from('agents')
      .update({ status: 'suspended' })
      .eq('agent_id', agentId)
      .select()
      .single();

    if (error) throw error;

    logger.warn(`Agent suspended: ${agentId}`);
    return data;
  }

  /**
   * Archive agent
   */
  static async archiveAgent(agentId: string): Promise<Agent> {
    const { data, error } = await supabase
      .from('agents')
      .update({ status: 'archived' })
      .eq('agent_id', agentId)
      .select()
      .single();

    if (error) throw error;

    logger.info(`Agent archived: ${agentId}`);
    return data;
  }

  /**
   * Create audit log
   */
  static async logAction(
    _agentId: string,
    entityType: string,
    entityId: string,
    action: string,
    actor: string,
    actorType: 'human' | 'agent',
    details: Record<string, unknown>,
    ipAddress?: string
  ): Promise<void> {
    await supabase.from('audit_logs').insert({
      log_id: uuidv4(),
      entity_type: entityType,
      entity_id: entityId,
      action,
      actor,
      actor_type: actorType,
      details,
      ip_address: ipAddress,
      timestamp: new Date().toISOString(),
    });
  }
}
