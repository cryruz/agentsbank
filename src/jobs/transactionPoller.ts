import { supabase } from '../config/supabase.js';
import { TransactionService } from '../services/transaction.js';
import { WalletService } from '../services/wallet.js';
import { getTransactionReceipt } from '../services/blockchain.js';
import { logger } from '../utils/logger.js';
import { TRANSACTION_STATUS } from '../constants.js';

/**
 * Background job: Poll transaction statuses
 * Run periodically (every 30 seconds) to update pending transactions
 */
export async function pollPendingTransactions() {
  try {
    // Get all pending transactions
    const { data: pendingTxs, error } = await supabase
      .from('transactions')
      .select('tx_id, tx_hash, metadata')
      .eq('status', TRANSACTION_STATUS.PENDING)
      .not('tx_hash', 'is', null)
      .limit(100);

    if (error) {
      logger.error('Failed to fetch pending transactions:', error);
      return;
    }

    if (!pendingTxs || pendingTxs.length === 0) {
      logger.debug('No pending transactions to poll');
      return;
    }

    logger.info(`Polling ${pendingTxs.length} pending transactions`);

    // Process each transaction
    for (const tx of pendingTxs) {
      try {
        const metadata = (tx.metadata as any) || {};
        const chain = metadata.chain as string;
        const receipt = await getTransactionReceipt(chain, tx.tx_hash as string);

        if (receipt.status !== 'pending') {
          const newStatus =
            receipt.status === 'confirmed'
              ? TRANSACTION_STATUS.CONFIRMED
              : TRANSACTION_STATUS.FAILED;

          await TransactionService.updateStatus(tx.tx_id, newStatus, tx.tx_hash);

          // If confirmed, update wallet balance
          if (newStatus === TRANSACTION_STATUS.CONFIRMED) {
            const { data: transaction } = await supabase
              .from('transactions')
              .select('wallet_id')
              .eq('tx_id', tx.tx_id)
              .single();

            if (transaction) {
              const wallet = await WalletService.getWallet(transaction.wallet_id);
              const balance = await WalletService.fetchBalance(
                wallet.address,
                wallet.chain
              );
              await WalletService.updateBalance(wallet.wallet_id, {
                ...wallet.balance,
                native: balance,
              });
            }
          }

          logger.info(`Transaction ${tx.tx_id} status updated to ${newStatus}`);
        }
      } catch (error) {
        logger.error(`Failed to poll transaction ${tx.tx_id}:`, error);
      }
    }
  } catch (error) {
    logger.error('Poll pending transactions job failed:', error);
  }
}

/**
 * Start background polling job
 */
export function startPollingJob(intervalMs: number = 30000) {
  logger.info(`Starting transaction polling job (interval: ${intervalMs}ms)`);

  setInterval(async () => {
    await pollPendingTransactions();
  }, intervalMs);
}
