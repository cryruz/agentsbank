import { supabase, type Transaction } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import { TRANSACTION_STATUS } from '../constants.js';

export class TransactionService {
  /**
   * Create transaction record
   */
  static async createTransaction(
    walletId: string,
    type: string,
    amount: string,
    currency: string,
    fromAddress: string,
    toAddress: string,
    metadata: Record<string, unknown> = {}
  ): Promise<Transaction> {
    const txId = uuidv4();

    const { data, error } = await supabase
      .from('transactions')
      .insert({
        tx_id: txId,
        wallet_id: walletId,
        type,
        amount,
        currency,
        from_address: fromAddress,
        to_address: toAddress,
        status: TRANSACTION_STATUS.PENDING,
        fee: '0',
        timestamp: new Date().toISOString(),
        metadata,
      })
      .select()
      .single();

    if (error) throw error;

    logger.info(`Transaction created: ${txId} (${type})`);
    return data;
  }

  /**
   * Update transaction status
   */
  static async updateStatus(
    txId: string,
    status: string,
    txHash?: string,
    fee?: string
  ): Promise<Transaction> {
    const updateData: any = { status };

    if (txHash) {
      updateData.tx_hash = txHash;
    }

    if (fee) {
      updateData.fee = fee;
    }

    const { data, error } = await supabase
      .from('transactions')
      .update(updateData)
      .eq('tx_id', txId)
      .select()
      .single();

    if (error) throw error;

    logger.info(`Transaction status updated: ${txId} -> ${status}`);
    return data;
  }

  /**
   * Get transaction by ID
   */
  static async getTransaction(txId: string): Promise<Transaction> {
    const { data, error } = await supabase
      .from('transactions')
      .select()
      .eq('tx_id', txId)
      .single();

    if (error || !data) {
      throw new Error('Transaction not found');
    }

    return data;
  }

  /**
   * Get transactions for wallet
   */
  static async getWalletTransactions(
    walletId: string,
    status?: string,
    limit: number = 100
  ): Promise<Transaction[]> {
    let query = supabase
      .from('transactions')
      .select()
      .eq('wallet_id', walletId)
      .order('timestamp', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    query = query.limit(limit);

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  }

  /**
   * Check guardrails before transaction
   */
  static async checkGuardrails(
    agentId: string,
    amount: string,
    guardrails: Record<string, unknown>
  ): Promise<boolean> {
    const amountNum = parseFloat(amount);

    // Check max transaction amount
    const maxTx = guardrails.max_transaction_amount
      ? parseFloat(guardrails.max_transaction_amount as string)
      : Infinity;

    if (amountNum > maxTx) {
      logger.warn(`Transaction exceeds max amount for agent ${agentId}: ${amountNum} > ${maxTx}`);
      return false;
    }

    // Check daily spending
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data: todayTxs, error } = await supabase
      .from('transactions')
      .select()
      .eq('wallet_id', agentId) // Assuming wallet_id references agent
      .eq('status', TRANSACTION_STATUS.CONFIRMED)
      .gte('timestamp', today.toISOString());

    if (error) throw error;

    const dailySpent = (todayTxs || [])
      .reduce((sum: number, tx: Transaction) => sum + parseFloat(tx.amount), 0);

    const maxDaily = guardrails.max_daily_spend
      ? parseFloat(guardrails.max_daily_spend as string)
      : Infinity;

    if (dailySpent + amountNum > maxDaily) {
      logger.warn(`Daily spending limit exceeded for agent ${agentId}: ${dailySpent + amountNum} > ${maxDaily}`);
      return false;
    }

    return true;
  }

  /**
   * Get transaction statistics
   */
  static async getStats(walletId: string, days: number = 30): Promise<{
    total_transactions: number;
    confirmed_transactions: number;
    failed_transactions: number;
    total_volume: number;
    total_fees: number;
    success_rate: number;
  }> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data: txs, error } = await supabase
      .from('transactions')
      .select()
      .eq('wallet_id', walletId)
      .gte('timestamp', startDate.toISOString());

    if (error) throw error;

    const allTxs = (txs || []) as Transaction[];
    const confirmed = allTxs.filter((tx) => tx.status === TRANSACTION_STATUS.CONFIRMED);
    const failed = allTxs.filter((tx) => tx.status === TRANSACTION_STATUS.FAILED);

    return {
      total_transactions: allTxs.length,
      confirmed_transactions: confirmed.length,
      failed_transactions: failed.length,
      total_volume: confirmed.reduce((sum: number, tx: Transaction) => sum + parseFloat(tx.amount), 0),
      total_fees: confirmed.reduce((sum: number, tx: Transaction) => sum + parseFloat(tx.fee), 0),
      success_rate: allTxs.length > 0 ? (confirmed.length / allTxs.length) * 100 : 0,
    };
  }
}
