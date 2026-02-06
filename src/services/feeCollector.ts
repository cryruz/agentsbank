import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from '../config/supabase.js';
import { WalletService } from './wallet.js';
import { logger } from '../utils/logger.js';
import {
  TREASURY_WALLETS,
  FEE_SWEEP_THRESHOLDS,
  FEE_SWEEP_MAX_AGE_HOURS,
  MIN_RECORDABLE_FEE_USD,
  TOKEN_PRICES_USD,
  TOKEN_DECIMALS,
} from '../constants.js';

export interface FeeLedgerEntry {
  id: string;
  wallet_id: string;
  agent_id: string;
  chain: string;
  currency: string;
  fee_amount: string;
  fee_amount_usd: string;
  transaction_id: string;
  status: 'pending' | 'collected' | 'written_off';
  created_at: string;
}

export interface FeeCollectionBatch {
  batch_id: string;
  chain: string;
  currency: string;
  total_fees: string;
  total_fees_usd: string;
  fee_count: number;
  treasury_address: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  tx_hash?: string;
  gas_cost_usd?: string;
  net_collected_usd?: string;
}

export interface PendingFeesSummary {
  chain: string;
  currency: string;
  fee_count: number;
  total_fees: number;
  total_fees_usd: number;
  oldest_fee_at: string;
  ready_for_sweep: boolean;
  threshold_usd: number;
}

export class FeeCollector {
  
  // ============================================
  // FEE RECORDING
  // ============================================
  
  /**
   * Record a fee in the ledger after a successful transaction
   * Called by TransactionProcessor after tx confirmation
   */
  static async recordFee(
    walletId: string,
    agentId: string,
    chain: string,
    currency: string,
    feeAmount: string,
    feeAmountUsd: string,
    transactionId: string
  ): Promise<FeeLedgerEntry | null> {
    // Skip tiny fees (not worth tracking)
    if (parseFloat(feeAmountUsd) < MIN_RECORDABLE_FEE_USD) {
      logger.debug(`Fee $${feeAmountUsd} below minimum, absorbing as operational cost`);
      return null;
    }
    
    const { data, error } = await supabaseAdmin
      .from('fee_ledger')
      .insert({
        wallet_id: walletId,
        agent_id: agentId,
        chain,
        currency,
        fee_amount: feeAmount,
        fee_amount_usd: feeAmountUsd,
        transaction_id: transactionId,
        status: 'pending',
      })
      .select()
      .single();
    
    if (error) {
      logger.error('Failed to record fee:', error);
      throw error;
    }
    
    logger.info(`Fee recorded: $${feeAmountUsd} from wallet ${walletId} on ${chain}`);
    
    // Check if we should trigger a sweep
    await this.checkAndTriggerSweep(chain, currency);
    
    return data;
  }
  
  // ============================================
  // FEE ACCUMULATION QUERIES
  // ============================================
  
  /**
   * Get pending fees summary by chain
   */
  static async getPendingFeesSummary(): Promise<PendingFeesSummary[]> {
    const { data, error } = await supabaseAdmin
      .from('fee_ledger')
      .select('chain, currency, fee_amount, fee_amount_usd, created_at')
      .eq('status', 'pending');
    
    if (error) throw error;
    
    // Group by chain/currency
    const grouped: Record<string, {
      fees: number;
      feesUsd: number;
      count: number;
      oldest: string;
    }> = {};
    
    for (const fee of data || []) {
      const key = `${fee.chain}:${fee.currency}`;
      if (!grouped[key]) {
        grouped[key] = { fees: 0, feesUsd: 0, count: 0, oldest: fee.created_at };
      }
      grouped[key].fees += parseFloat(fee.fee_amount);
      grouped[key].feesUsd += parseFloat(fee.fee_amount_usd);
      grouped[key].count++;
      if (fee.created_at < grouped[key].oldest) {
        grouped[key].oldest = fee.created_at;
      }
    }
    
    return Object.entries(grouped).map(([key, val]) => {
      const [chain, currency] = key.split(':');
      const threshold = FEE_SWEEP_THRESHOLDS[chain] || 10;
      const ageHours = (Date.now() - new Date(val.oldest).getTime()) / (1000 * 60 * 60);
      
      return {
        chain,
        currency,
        fee_count: val.count,
        total_fees: val.fees,
        total_fees_usd: val.feesUsd,
        oldest_fee_at: val.oldest,
        ready_for_sweep: val.feesUsd >= threshold || ageHours >= FEE_SWEEP_MAX_AGE_HOURS,
        threshold_usd: threshold,
      };
    });
  }
  
  /**
   * Get pending fees for a specific chain ready for collection
   */
  static async getPendingFeesForChain(
    chain: string,
    currency: string
  ): Promise<FeeLedgerEntry[]> {
    const { data, error } = await supabaseAdmin
      .from('fee_ledger')
      .select('*')
      .eq('chain', chain)
      .eq('currency', currency)
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    
    if (error) throw error;
    return data || [];
  }
  
  // ============================================
  // FEE COLLECTION / SWEEPING
  // ============================================
  
  /**
   * Check if accumulated fees meet threshold and trigger sweep
   */
  static async checkAndTriggerSweep(chain: string, currency: string): Promise<boolean> {
    const pendingFees = await this.getPendingFeesForChain(chain, currency);
    if (pendingFees.length === 0) return false;
    
    const totalUsd = pendingFees.reduce((sum, f) => sum + parseFloat(f.fee_amount_usd), 0);
    const threshold = FEE_SWEEP_THRESHOLDS[chain] || 10;
    
    // Check age of oldest fee
    const oldestFee = pendingFees[0];
    const ageHours = (Date.now() - new Date(oldestFee.created_at).getTime()) / (1000 * 60 * 60);
    
    const shouldSweep = totalUsd >= threshold || ageHours >= FEE_SWEEP_MAX_AGE_HOURS;
    
    if (shouldSweep) {
      logger.info(`Fee sweep triggered for ${chain}/${currency}: $${totalUsd.toFixed(2)} accumulated (threshold: $${threshold})`);
      // Don't await - let it run in background
      this.executeFeeCollection(chain, currency).catch(err => {
        logger.error(`Fee collection failed for ${chain}/${currency}:`, err);
      });
      return true;
    }
    
    return false;
  }
  
  /**
   * Execute fee collection - sweep accumulated fees to treasury
   * This is the core fee collection logic
   */
  static async executeFeeCollection(
    chain: string,
    currency: string
  ): Promise<FeeCollectionBatch | null> {
    const treasuryAddress = TREASURY_WALLETS[chain];
    if (!treasuryAddress || treasuryAddress.includes('0000000000')) {
      logger.warn(`Treasury address not configured for ${chain}, skipping collection`);
      return null;
    }
    
    // Get pending fees
    const pendingFees = await this.getPendingFeesForChain(chain, currency);
    if (pendingFees.length === 0) {
      logger.info(`No pending fees to collect for ${chain}/${currency}`);
      return null;
    }
    
    // Calculate totals
    const totalFees = pendingFees.reduce((sum, f) => sum + parseFloat(f.fee_amount), 0);
    const totalFeesUsd = pendingFees.reduce((sum, f) => sum + parseFloat(f.fee_amount_usd), 0);
    
    // Create batch record
    const batchId = uuidv4();
    const { data: batch, error: batchError } = await supabaseAdmin
      .from('fee_collection_batches')
      .insert({
        batch_id: batchId,
        chain,
        currency,
        total_fees: totalFees.toFixed(TOKEN_DECIMALS[currency] || 18),
        total_fees_usd: totalFeesUsd.toFixed(6),
        fee_count: pendingFees.length,
        treasury_address: treasuryAddress,
        status: 'processing',
      })
      .select()
      .single();
    
    if (batchError) throw batchError;
    
    logger.info(`Fee collection batch ${batchId} started: ${pendingFees.length} fees, $${totalFeesUsd.toFixed(2)}`);
    
    try {
      // For custodial wallets, we need to aggregate fees from multiple wallets
      // Group fees by source wallet
      const feesByWallet: Record<string, { amount: number; fees: FeeLedgerEntry[] }> = {};
      for (const fee of pendingFees) {
        if (!feesByWallet[fee.wallet_id]) {
          feesByWallet[fee.wallet_id] = { amount: 0, fees: [] };
        }
        feesByWallet[fee.wallet_id].amount += parseFloat(fee.fee_amount);
        feesByWallet[fee.wallet_id].fees.push(fee);
      }
      
      // Execute transfers from each wallet to treasury
      let totalGasCostUsd = 0;
      const txHashes: string[] = [];
      
      for (const [walletId, { amount, fees }] of Object.entries(feesByWallet)) {
        try {
          // Transfer accumulated fees from this wallet to treasury
          const result = await WalletService.signAndSendTransaction(
            walletId,
            treasuryAddress,
            amount.toFixed(TOKEN_DECIMALS[currency] || 18),
            chain,
            currency
          );
          
          txHashes.push(result.txHash);
          
          // Estimate gas cost (rough)
          const gasUsd = chain === 'ethereum' ? 5 : chain === 'bsc' ? 0.1 : 0.01;
          totalGasCostUsd += gasUsd;
          
          // Mark fees as collected
          await supabaseAdmin
            .from('fee_ledger')
            .update({
              status: 'collected',
              collected_at: new Date().toISOString(),
              collection_tx_hash: result.txHash,
              collection_batch_id: batchId,
            })
            .in('id', fees.map(f => f.id));
          
          logger.info(`Collected ${amount} ${currency} from wallet ${walletId} -> treasury (${result.txHash})`);
          
        } catch (walletError: any) {
          logger.error(`Failed to collect fees from wallet ${walletId}:`, walletError);
          // Continue with other wallets
        }
      }
      
      // Calculate net collected
      const netCollectedUsd = totalFeesUsd - totalGasCostUsd;
      
      // Update batch as completed
      await supabaseAdmin
        .from('fee_collection_batches')
        .update({
          status: 'completed',
          tx_hash: txHashes.join(','),
          gas_cost_usd: totalGasCostUsd.toFixed(6),
          net_collected_usd: netCollectedUsd.toFixed(6),
          completed_at: new Date().toISOString(),
        })
        .eq('batch_id', batchId);
      
      logger.info(`Fee collection batch ${batchId} completed: $${netCollectedUsd.toFixed(2)} net collected`);
      
      return {
        ...batch,
        status: 'completed',
        tx_hash: txHashes.join(','),
        gas_cost_usd: totalGasCostUsd.toFixed(6),
        net_collected_usd: netCollectedUsd.toFixed(6),
      };
      
    } catch (error: any) {
      // Mark batch as failed
      await supabaseAdmin
        .from('fee_collection_batches')
        .update({
          status: 'failed',
          error_message: error.message,
          retry_count: (batch.retry_count || 0) + 1,
        })
        .eq('batch_id', batchId);
      
      logger.error(`Fee collection batch ${batchId} failed:`, error);
      throw error;
    }
  }
  
  /**
   * Force sweep all chains regardless of threshold
   * Used for manual collection or system shutdown
   */
  static async forceCollectAll(): Promise<FeeCollectionBatch[]> {
    const summary = await this.getPendingFeesSummary();
    const results: FeeCollectionBatch[] = [];
    
    for (const entry of summary) {
      if (entry.fee_count > 0) {
        try {
          const batch = await this.executeFeeCollection(entry.chain, entry.currency);
          if (batch) results.push(batch);
        } catch (error) {
          logger.error(`Force collection failed for ${entry.chain}/${entry.currency}:`, error);
        }
      }
    }
    
    return results;
  }
  
  // ============================================
  // REPORTING
  // ============================================
  
  /**
   * Get fee collection history
   */
  static async getCollectionHistory(
    chain?: string,
    days: number = 30
  ): Promise<FeeCollectionBatch[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);
    
    let query = supabaseAdmin
      .from('fee_collection_batches')
      .select('*')
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false });
    
    if (chain) {
      query = query.eq('chain', chain);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }
  
  /**
   * Get total fees collected
   */
  static async getTotalFeesCollected(
    chain?: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<{ total_usd: number; net_usd: number; gas_spent_usd: number }> {
    let query = supabaseAdmin
      .from('fee_collection_batches')
      .select('total_fees_usd, net_collected_usd, gas_cost_usd')
      .eq('status', 'completed');
    
    if (chain) query = query.eq('chain', chain);
    if (startDate) query = query.gte('created_at', startDate.toISOString());
    if (endDate) query = query.lte('created_at', endDate.toISOString());
    
    const { data, error } = await query;
    if (error) throw error;
    
    return (data || []).reduce((acc, batch) => ({
      total_usd: acc.total_usd + parseFloat(batch.total_fees_usd || '0'),
      net_usd: acc.net_usd + parseFloat(batch.net_collected_usd || '0'),
      gas_spent_usd: acc.gas_spent_usd + parseFloat(batch.gas_cost_usd || '0'),
    }), { total_usd: 0, net_usd: 0, gas_spent_usd: 0 });
  }
}
