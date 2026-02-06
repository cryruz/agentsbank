import { ethers } from 'ethers';
import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin, type Transaction, type FeeCalculation, type QuotaStatus, type Wallet } from '../config/supabase.js';
import { WalletService } from './wallet.js';
import { AgentService } from './agent.js';
import { logger } from '../utils/logger.js';
import {
  BANK_FEES,
  ESTIMATED_CHAIN_FEES,
  DEFAULT_QUOTAS,
  TOKEN_PRICES_USD,
  TOKEN_DECIMALS,
  TRANSACTION_STATUS,
  MINIMUM_TRANSACTION_USD,
  MINIMUM_TRANSACTION_NATIVE,
  RECOMMENDED_MINIMUM_USD,
} from '../constants.js';
import { FeeCollector } from './feeCollector.js';

// Free public RPC endpoints from publicnode.com
const RPC_ENDPOINTS: Record<string, string> = {
  ethereum: process.env.ETH_RPC_URL || 'https://ethereum-rpc.publicnode.com',
  bsc: process.env.BNB_RPC_URL || 'https://bsc-rpc.publicnode.com',
  solana: process.env.SOL_RPC_URL || 'https://solana-rpc.publicnode.com',
};

// Type for minimum transaction requirements
export type MinimumTransaction = {
  minimum_usd: number;
  minimum_native: string;
  recommended_usd: number;
  currency: string;
};

export class TransactionProcessor {
  
  // ============================================
  // PRICE & CONVERSION UTILITIES
  // ============================================
  
  /**
   * Get current token price in USD
   * In production, fetch from price oracle (Chainlink, CoinGecko, etc.)
   */
  static getTokenPriceUSD(token: string): number {
    return TOKEN_PRICES_USD[token.toUpperCase()] || 1;
  }
  
  /**
   * Convert amount to USD
   */
  static toUSD(amount: string, token: string): number {
    const price = this.getTokenPriceUSD(token);
    return parseFloat(amount) * price;
  }
  
  /**
   * Convert USD to token amount
   */
  static fromUSD(usdAmount: number, token: string): string {
    const price = this.getTokenPriceUSD(token);
    return (usdAmount / price).toFixed(TOKEN_DECIMALS[token.toUpperCase()] || 18);
  }

  // ============================================
  // FEE CALCULATIONS
  // ============================================
  
  /**
   * Get the fee tier for an agent based on monthly volume
   */
  static async getAgentFeeTier(agentId: string): Promise<{ tier: string; percentage: number; monthlyVolume: number }> {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    const { data: monthlyTxs } = await supabaseAdmin
      .from('transactions')
      .select('amount, currency')
      .eq('status', 'confirmed')
      .gte('timestamp', startOfMonth.toISOString());
    
    // Calculate monthly volume in USD
    const monthlyVolume = (monthlyTxs || []).reduce((sum, tx) => {
      return sum + this.toUSD(tx.amount, tx.currency);
    }, 0);
    
    // Find applicable tier
    for (const tier of BANK_FEES.TIERS) {
      if (monthlyVolume >= tier.min_volume && monthlyVolume < tier.max_volume) {
        const tierName = tier.max_volume === Infinity 
          ? 'enterprise' 
          : tier.max_volume >= 100000 
            ? 'business' 
            : tier.max_volume >= 10000 
              ? 'growth' 
              : 'starter';
        return {
          tier: tierName,
          percentage: tier.percentage,
          monthlyVolume,
        };
      }
    }
    
    return { tier: 'starter', percentage: BANK_FEES.BASE_PERCENTAGE, monthlyVolume };
  }
  
  /**
   * Estimate chain/gas fee for a transaction
   */
  static async estimateChainFee(
    chain: string,
    fromAddress: string,
    toAddress: string,
    amount: string,
    isTokenTransfer: boolean = false
  ): Promise<{ fee: string; feeUSD: string; currency: string }> {
    const chainFees = ESTIMATED_CHAIN_FEES[chain as keyof typeof ESTIMATED_CHAIN_FEES];
    if (!chainFees) {
      throw new Error(`Unsupported chain: ${chain}`);
    }
    
    let estimatedFee: string;
    
    // Try to get live gas estimate for EVM chains
    if (chain === 'ethereum' || chain === 'bsc') {
      try {
        const provider = new ethers.JsonRpcProvider(RPC_ENDPOINTS[chain]);
        const feeData = await provider.getFeeData();
        const gasLimit = isTokenTransfer ? 65000n : 21000n;
        const gasPrice = feeData.gasPrice || ethers.parseUnits('20', 'gwei');
        const gasCost = gasLimit * gasPrice;
        estimatedFee = ethers.formatEther(gasCost);
      } catch (error) {
        // Fall back to static estimates
        logger.warn(`Failed to get live gas estimate for ${chain}, using static estimate`);
        estimatedFee = isTokenTransfer ? chainFees.token_transfer : chainFees.native_transfer;
      }
    } else {
      // Use static estimates for non-EVM chains
      estimatedFee = isTokenTransfer ? chainFees.token_transfer : chainFees.native_transfer;
    }
    
    const feeUSD = this.toUSD(estimatedFee, chainFees.currency);
    
    return {
      fee: estimatedFee,
      feeUSD: feeUSD.toFixed(6),
      currency: chainFees.currency,
    };
  }
  
  /**
   * Calculate bank fee for a transaction
   */
  static async calculateBankFee(
    agentId: string,
    amount: string,
    currency: string,
    chain: string
  ): Promise<{ fee: string; feeUSD: string; percentage: number; tier: string }> {
    const amountUSD = this.toUSD(amount, currency);
    const { tier, percentage } = await this.getAgentFeeTier(agentId);
    
    // Apply chain multiplier
    const chainMultiplier = BANK_FEES.CHAIN_MULTIPLIERS[chain] || 1.0;
    const adjustedPercentage = percentage * chainMultiplier;
    
    // Calculate fee
    let feeUSD = amountUSD * adjustedPercentage;
    
    // Apply min/max caps
    feeUSD = Math.max(feeUSD, BANK_FEES.MIN_FEE_USD);
    feeUSD = Math.min(feeUSD, BANK_FEES.MAX_FEE_USD);
    
    // Convert back to transaction currency
    const feeInCurrency = this.fromUSD(feeUSD, currency);
    
    return {
      fee: feeInCurrency,
      feeUSD: feeUSD.toFixed(6),
      percentage: adjustedPercentage * 100,
      tier,
    };
  }
  
  /**
   * Calculate complete fee breakdown for a transaction
   */
  static async calculateFees(
    agentId: string,
    walletId: string,
    toAddress: string,
    amount: string,
    currency: string,
    txType: string = 'transfer'
  ): Promise<FeeCalculation> {
    const wallet = await WalletService.getWallet(walletId);
    const chain = wallet.chain;
    
    const isTokenTransfer = !['ETH', 'BNB', 'SOL', 'BTC'].includes(currency.toUpperCase());
    
    // Get chain fee
    const chainFeeResult = await this.estimateChainFee(
      chain,
      wallet.address,
      toAddress,
      amount,
      isTokenTransfer
    );
    
    // Get bank fee
    const bankFeeResult = await this.calculateBankFee(agentId, amount, currency, chain);
    
    // Calculate totals
    const amountUSD = this.toUSD(amount, currency);
    const totalFeeUSD = parseFloat(chainFeeResult.feeUSD) + parseFloat(bankFeeResult.feeUSD);
    
    // Total deducted depends on whether chain fee is in same currency
    const nativeToken = ESTIMATED_CHAIN_FEES[chain as keyof typeof ESTIMATED_CHAIN_FEES]?.currency || 'ETH';
    let totalDeducted: string;
    let totalDeductedUSD: number;
    
    if (currency.toUpperCase() === nativeToken) {
      // Same currency - add all fees
      totalDeducted = (parseFloat(amount) + parseFloat(chainFeeResult.fee) + parseFloat(bankFeeResult.fee)).toFixed(
        TOKEN_DECIMALS[currency.toUpperCase()] || 18
      );
      totalDeductedUSD = amountUSD + totalFeeUSD;
    } else {
      // Different currencies - deduct amount + bank fee in tx currency, chain fee in native
      totalDeducted = (parseFloat(amount) + parseFloat(bankFeeResult.fee)).toFixed(
        TOKEN_DECIMALS[currency.toUpperCase()] || 18
      );
      totalDeductedUSD = amountUSD + parseFloat(bankFeeResult.feeUSD);
      // Note: chain fee will be deducted from native token balance separately
    }
    
    return {
      amount,
      amount_usd: amountUSD.toFixed(2),
      currency,
      chain,
      
      chain_fee: chainFeeResult.fee,
      chain_fee_currency: chainFeeResult.currency,
      chain_fee_usd: chainFeeResult.feeUSD,
      
      bank_fee: bankFeeResult.fee,
      bank_fee_currency: currency,
      bank_fee_usd: bankFeeResult.feeUSD,
      bank_fee_percentage: bankFeeResult.percentage,
      bank_fee_tier: bankFeeResult.tier,
      
      total_fee_usd: totalFeeUSD.toFixed(6),
      total_deducted: totalDeducted,
      total_deducted_usd: totalDeductedUSD.toFixed(2),
      
      exchange_rates: {
        [currency]: this.getTokenPriceUSD(currency),
        [nativeToken]: this.getTokenPriceUSD(nativeToken),
      },
    };
  }

  // ============================================
  // QUOTA & LIMIT CHECKING
  // ============================================
  
  /**
   * Get current quota status for an agent
   */
  static async getQuotaStatus(agentId: string): Promise<QuotaStatus> {
    const agent = await AgentService.getAgent(agentId);
    const guardrails = agent.guardrails || {};
    
    // Get date boundaries
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    // Get agent's wallets
    const wallets = await WalletService.listWallets(agentId);
    const walletIds = wallets.map(w => w.wallet_id);
    
    // Query daily transactions
    const { data: dailyTxs } = await supabaseAdmin
      .from('transactions')
      .select('amount, currency')
      .in('wallet_id', walletIds)
      .in('status', ['confirmed', 'pending', 'processing'])
      .gte('timestamp', today.toISOString());
    
    // Query monthly transactions
    const { data: monthlyTxs } = await supabaseAdmin
      .from('transactions')
      .select('amount, currency')
      .in('wallet_id', walletIds)
      .in('status', ['confirmed', 'pending', 'processing'])
      .gte('timestamp', startOfMonth.toISOString());
    
    // Calculate volumes
    const dailyVolume = (dailyTxs || []).reduce((sum, tx) => sum + this.toUSD(tx.amount, tx.currency), 0);
    const monthlyVolume = (monthlyTxs || []).reduce((sum, tx) => sum + this.toUSD(tx.amount, tx.currency), 0);
    
    // Get limits from guardrails or use defaults
    const maxDailyVolume = parseFloat(guardrails.max_daily_spend as string) || DEFAULT_QUOTAS.max_daily_volume_usd;
    const maxMonthlyVolume = parseFloat(guardrails.max_monthly_spend as string) || DEFAULT_QUOTAS.max_monthly_volume_usd;
    const maxTransaction = parseFloat(guardrails.max_transaction_amount as string) || DEFAULT_QUOTAS.max_transaction_usd;
    const maxDailyTxCount = (guardrails.max_daily_transactions as number) || DEFAULT_QUOTAS.max_daily_transactions;
    const maxMonthlyTxCount = (guardrails.max_monthly_transactions as number) || DEFAULT_QUOTAS.max_monthly_transactions;
    
    // Get fee tier
    const { tier, percentage } = await this.getAgentFeeTier(agentId);
    
    // Determine if agent can transact
    let canTransact = true;
    let rejectionReason: string | undefined;
    
    if ((dailyTxs || []).length >= maxDailyTxCount) {
      canTransact = false;
      rejectionReason = 'Daily transaction count limit reached';
    } else if (dailyVolume >= maxDailyVolume) {
      canTransact = false;
      rejectionReason = 'Daily volume limit reached';
    } else if ((monthlyTxs || []).length >= maxMonthlyTxCount) {
      canTransact = false;
      rejectionReason = 'Monthly transaction count limit reached';
    } else if (monthlyVolume >= maxMonthlyVolume) {
      canTransact = false;
      rejectionReason = 'Monthly volume limit reached';
    }
    
    return {
      agent_id: agentId,
      
      daily_transaction_count: (dailyTxs || []).length,
      daily_volume_usd: dailyVolume,
      daily_limit_remaining_usd: Math.max(0, maxDailyVolume - dailyVolume),
      
      monthly_transaction_count: (monthlyTxs || []).length,
      monthly_volume_usd: monthlyVolume,
      monthly_limit_remaining_usd: Math.max(0, maxMonthlyVolume - monthlyVolume),
      
      fee_tier: tier,
      fee_percentage: percentage * 100,
      
      max_transaction_usd: maxTransaction,
      can_transact: canTransact,
      rejection_reason: rejectionReason,
    };
  }
  
  /**
   * Get minimum transaction requirements for a chain/token
   */
  static getMinimumTransaction(chain: string, currency: string): {
    minimum_usd: number;
    minimum_native: string;
    recommended_usd: number;
    currency: string;
  } {
    const minUSD = MINIMUM_TRANSACTION_USD[chain] || 1.00;
    const minNative = MINIMUM_TRANSACTION_NATIVE[chain]?.[currency.toUpperCase()] || '0';
    const recommendedUSD = RECOMMENDED_MINIMUM_USD[chain] || minUSD * 2;
    
    return {
      minimum_usd: minUSD,
      minimum_native: minNative,
      recommended_usd: recommendedUSD,
      currency: currency.toUpperCase(),
    };
  }
  
  /**
   * Validate transaction amount against minimums
   */
  static validateMinimumAmount(
    chain: string,
    amount: string,
    currency: string
  ): { valid: boolean; reason?: string; minimum: MinimumTransaction } {
    const minimum = this.getMinimumTransaction(chain, currency);
    const amountNum = parseFloat(amount);
    const amountUSD = this.toUSD(amount, currency);
    
    // Check USD minimum
    if (amountUSD < minimum.minimum_usd) {
      return {
        valid: false,
        reason: `Transaction amount $${amountUSD.toFixed(2)} is below minimum $${minimum.minimum_usd.toFixed(2)} for ${chain}. Gas fees would consume too much of the transaction.`,
        minimum,
      };
    }
    
    // Check native token minimum (dust limits)
    if (minimum.minimum_native && parseFloat(minimum.minimum_native) > 0) {
      if (amountNum < parseFloat(minimum.minimum_native)) {
        return {
          valid: false,
          reason: `Transaction amount ${amount} ${currency} is below minimum ${minimum.minimum_native} ${currency} (dust limit).`,
          minimum,
        };
      }
    }
    
    return { valid: true, minimum };
  }
  
  /**
   * Validate transaction against quotas, guardrails, and minimums
   */
  static async validateTransaction(
    agentId: string,
    amount: string,
    currency: string,
    chain?: string
  ): Promise<{ 
    valid: boolean; 
    reason?: string; 
    quotaStatus: QuotaStatus;
    minimum?: MinimumTransaction;
  }> {
    const quotaStatus = await this.getQuotaStatus(agentId);
    const amountUSD = this.toUSD(amount, currency);
    
    // Check minimum amount if chain is provided
    if (chain) {
      const minValidation = this.validateMinimumAmount(chain, amount, currency);
      if (!minValidation.valid) {
        return { 
          valid: false, 
          reason: minValidation.reason, 
          quotaStatus,
          minimum: minValidation.minimum,
        };
      }
    }
    
    if (!quotaStatus.can_transact) {
      return { valid: false, reason: quotaStatus.rejection_reason, quotaStatus };
    }
    
    if (amountUSD > quotaStatus.max_transaction_usd) {
      return {
        valid: false,
        reason: `Transaction amount $${amountUSD.toFixed(2)} exceeds max allowed $${quotaStatus.max_transaction_usd}`,
        quotaStatus,
      };
    }
    
    if (amountUSD > quotaStatus.daily_limit_remaining_usd) {
      return {
        valid: false,
        reason: `Transaction amount $${amountUSD.toFixed(2)} exceeds daily remaining limit $${quotaStatus.daily_limit_remaining_usd.toFixed(2)}`,
        quotaStatus,
      };
    }
    
    if (amountUSD > quotaStatus.monthly_limit_remaining_usd) {
      return {
        valid: false,
        reason: `Transaction amount $${amountUSD.toFixed(2)} exceeds monthly remaining limit $${quotaStatus.monthly_limit_remaining_usd.toFixed(2)}`,
        quotaStatus,
      };
    }
    
    return { valid: true, quotaStatus };
  }

  // ============================================
  // TRANSACTION EXECUTION
  // ============================================
  
  /**
   * Create a detailed transaction record
   */
  static async createDetailedTransaction(
    walletId: string,
    agentId: string,
    toAddress: string,
    amount: string,
    currency: string,
    txType: string,
    feeCalculation: FeeCalculation
  ): Promise<Transaction> {
    const wallet = await WalletService.getWallet(walletId);
    const txId = uuidv4();
    
    const { data, error } = await supabaseAdmin
      .from('transactions')
      .insert({
        tx_id: txId,
        wallet_id: walletId,
        type: txType,
        amount,
        currency,
        from_address: wallet.address,
        to_address: toAddress,
        status: TRANSACTION_STATUS.PENDING,
        
        // Fee breakdown
        chain_fee: feeCalculation.chain_fee,
        chain_fee_usd: feeCalculation.chain_fee_usd,
        bank_fee: feeCalculation.bank_fee,
        bank_fee_usd: feeCalculation.bank_fee_usd,
        total_fee: (parseFloat(feeCalculation.chain_fee_usd) + parseFloat(feeCalculation.bank_fee_usd)).toFixed(6),
        total_fee_usd: feeCalculation.total_fee_usd,
        
        // Totals
        total_deducted: feeCalculation.total_deducted,
        total_deducted_usd: feeCalculation.total_deducted_usd,
        
        // Legacy
        fee: feeCalculation.total_fee_usd,
        
        timestamp: new Date().toISOString(),
        metadata: {
          fee_calculation: feeCalculation,
          agent_id: agentId,
          chain: feeCalculation.chain,
        },
      })
      .select()
      .single();
    
    if (error) throw error;
    
    logger.info(`Transaction created: ${txId} - Amount: ${amount} ${currency}, Total fees: $${feeCalculation.total_fee_usd}`);
    return data;
  }
  
  /**
   * Process and execute a complete transaction
   * This is the main entry point for transaction processing
   */
  static async processTransaction(
    agentId: string,
    walletId: string,
    toAddress: string,
    amount: string,
    currency: string,
    txType: string = 'transfer'
  ): Promise<{
    transaction: Transaction;
    fees: FeeCalculation;
    quota: QuotaStatus;
    execution: { tx_hash?: string; status: string; error?: string };
  }> {
    // 1. Get wallet to know the chain
    const wallet = await WalletService.getWallet(walletId);
    
    // 2. Validate against quotas AND minimums
    const validation = await this.validateTransaction(agentId, amount, currency, wallet.chain);
    if (!validation.valid) {
      throw new Error(`Transaction rejected: ${validation.reason}`);
    }
    
    // 3. Calculate fees
    const fees = await this.calculateFees(agentId, walletId, toAddress, amount, currency, txType);
    
    // 4. Create transaction record
    const transaction = await this.createDetailedTransaction(
      walletId,
      agentId,
      toAddress,
      amount,
      currency,
      txType,
      fees
    );
    
    // 5. Execute the transaction
    let execution: { tx_hash?: string; status: string; error?: string };
    
    try {
      // Update status to processing
      await supabaseAdmin
        .from('transactions')
        .update({ status: 'processing' })
        .eq('tx_id', transaction.tx_id);
      
      // Sign and send (uses encrypted keys)
      const result = await WalletService.signAndSendTransaction(
        walletId,
        toAddress,
        amount,
        wallet.chain
      );
      
      // Update with success
      await supabaseAdmin
        .from('transactions')
        .update({
          status: 'confirmed',
          tx_hash: result.txHash,
        })
        .eq('tx_id', transaction.tx_id);
      
      execution = {
        tx_hash: result.txHash,
        status: 'confirmed',
      };
      
      // Record bank fee in ledger for collection
      // Fees accumulate until threshold is reached, then swept to treasury
      try {
        await FeeCollector.recordFee(
          walletId,
          agentId,
          wallet.chain,
          currency,
          fees.bank_fee,
          fees.bank_fee_usd,
          transaction.tx_id
        );
      } catch (feeError) {
        // Don't fail the transaction if fee recording fails
        logger.error('Failed to record fee (non-critical):', feeError);
      }
      
      logger.info(`Transaction confirmed: ${transaction.tx_id} -> ${result.txHash}`);
      
    } catch (error: any) {
      // Update with failure
      await supabaseAdmin
        .from('transactions')
        .update({
          status: 'failed',
          metadata: {
            ...transaction.metadata,
            error: error.message,
          },
        })
        .eq('tx_id', transaction.tx_id);
      
      execution = {
        status: 'failed',
        error: error.message,
      };
      
      logger.error(`Transaction failed: ${transaction.tx_id} - ${error.message}`);
    }
    
    // 6. Return complete result
    return {
      transaction: {
        ...transaction,
        status: execution.status as any,
        tx_hash: execution.tx_hash || null,
      },
      fees,
      quota: validation.quotaStatus,
      execution,
    };
  }
  
  /**
   * Get transaction with full fee breakdown
   */
  static async getTransactionDetails(txId: string): Promise<Transaction & { fee_breakdown: FeeCalculation | null }> {
    const { data, error } = await supabaseAdmin
      .from('transactions')
      .select()
      .eq('tx_id', txId)
      .single();
    
    if (error || !data) {
      throw new Error('Transaction not found');
    }
    
    return {
      ...data,
      fee_breakdown: data.metadata?.fee_calculation || null,
    };
  }
}
