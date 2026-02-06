import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

interface TransactionRecord {
  amount: string;
  status: string;
  timestamp: string;
  fee: string;
}

export interface SystemMetrics {
  timestamp: string;
  total_humans: number;
  total_agents: number;
  active_agents: number;
  total_wallets: number;
  total_transactions: number;
  pending_transactions: number;
  confirmed_transactions: number;
  failed_transactions: number;
  total_volume: string;
  average_transaction_size: string;
  success_rate: number;
}

export async function getSystemMetrics(): Promise<SystemMetrics> {
  try {
    const [
      { count: totalHumans },
      { count: totalAgents },
      { data: activeAgents },
      { count: totalWallets },
      { count: totalTransactions },
      { data: pendingTxs },
      { data: confirmedTxs },
      { data: failedTxs },
    ] = await Promise.all([
      supabase.from('humans').select('*', { count: 'exact', head: true }),
      supabase.from('agents').select('*', { count: 'exact', head: true }),
      supabase.from('agents').select().eq('status', 'active'),
      supabase.from('wallets').select('*', { count: 'exact', head: true }),
      supabase.from('transactions').select('*', { count: 'exact', head: true }),
      supabase.from('transactions').select().eq('status', 'pending'),
      supabase.from('transactions').select().eq('status', 'confirmed'),
      supabase.from('transactions').select().eq('status', 'failed'),
    ]);

    const confirmed = confirmedTxs || [];
    const total = (pendingTxs?.length || 0) + (confirmedTxs?.length || 0) + (failedTxs?.length || 0);

interface TransactionRecord {
  amount: string;
}

    const totalVolume = confirmed.reduce(
      (sum: number, tx: TransactionRecord) => sum + parseFloat(tx.amount),
      0
    );

    const avgSize =
      confirmed.length > 0
        ? totalVolume / confirmed.length
        : 0;

    const successRate =
      total > 0
        ? (confirmed.length / total) * 100
        : 0;

    return {
      timestamp: new Date().toISOString(),
      total_humans: totalHumans || 0,
      total_agents: totalAgents || 0,
      active_agents: activeAgents?.length || 0,
      total_wallets: totalWallets || 0,
      total_transactions: totalTransactions || 0,
      pending_transactions: pendingTxs?.length || 0,
      confirmed_transactions: confirmed.length,
      failed_transactions: failedTxs?.length || 0,
      total_volume: totalVolume.toFixed(4),
      average_transaction_size: avgSize.toFixed(6),
      success_rate: parseFloat(successRate.toFixed(2)),
    };
  } catch (error) {
    logger.error('Failed to get system metrics:', error);
    throw error;
  }
}

export async function getAgentMetrics(agentId: string): Promise<any> {
  try {
    // Get agent and wallets first
    const [{ data: agent }, { data: walletData }] = await Promise.all([
      supabase.from('agents').select().eq('agent_id', agentId).single(),
      supabase.from('wallets').select().eq('agent_id', agentId),
    ]);

    const wallets: Array<{wallet_id: string}> = walletData || [];

    // Get transactions for all wallets
    const { data: txs } = await supabase
      .from('transactions')
      .select()
      .in(
        'wallet_id',
        wallets.map((w: {wallet_id: string}) => w.wallet_id)
      );

    const confirmed = txs?.filter((tx: TransactionRecord) => tx.status === 'confirmed') || [];
    const failed = txs?.filter((tx: TransactionRecord) => tx.status === 'failed') || [];
    const pending = txs?.filter((tx: TransactionRecord) => tx.status === 'pending') || [];

    return {
      agent_id: agentId,
      agent_name: agent ? `${agent.first_name} ${agent.last_name}` : 'N/A',
      reputation_score: agent?.reputation_score || 0,
      total_wallets: wallets?.length || 0,
      total_transactions: txs?.length || 0,
      confirmed_transactions: confirmed.length,
      failed_transactions: failed.length,
      pending_transactions: pending.length,
      total_volume: confirmed.reduce((sum: number, tx: TransactionRecord) => sum + parseFloat(tx.amount), 0).toFixed(4),
      success_rate:
        txs && txs.length > 0
          ? ((confirmed.length / txs.length) * 100).toFixed(2)
          : 0,
      last_transaction: txs?.sort((a: TransactionRecord, b: TransactionRecord) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )[0]?.timestamp || null,
    };
  } catch (error) {
    logger.error('Failed to get agent metrics:', error);
    throw error;
  }
}

export async function getDailyStats(days: number = 30): Promise<any[]> {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data: txs, error } = await supabase
      .from('transactions')
      .select()
      .gte('timestamp', startDate.toISOString());

    if (error) throw error;

    // Group by date
    const grouped: Record<string, TransactionRecord[]> = {};
    (txs || []).forEach((tx: TransactionRecord) => {
      const date = new Date(tx.timestamp).toISOString().split('T')[0];
      if (!grouped[date]) grouped[date] = [];
      grouped[date].push(tx);
    });

    return Object.entries(grouped).map(([date, transactions]) => {
      const confirmed = transactions.filter((tx) => tx.status === 'confirmed');
      const failed = transactions.filter((tx) => tx.status === 'failed');

      return {
        date,
        total_transactions: transactions.length,
        confirmed_transactions: confirmed.length,
        failed_transactions: failed.length,
        total_volume: confirmed
          .reduce((sum, tx) => sum + parseFloat(tx.amount), 0)
          .toFixed(4),
        total_fees: confirmed
          .reduce((sum, tx) => sum + parseFloat(tx.fee), 0)
          .toFixed(6),
      };
    });
  } catch (error) {
    logger.error('Failed to get daily stats:', error);
    throw error;
  }
}
