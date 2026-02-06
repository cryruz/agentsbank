import { ethers } from 'ethers';
import { supabaseAdmin } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import { TOKEN_CONTRACTS, TOKEN_DECIMALS } from '../constants.js';

const RPC_ENDPOINTS: Record<string, string> = {
  ethereum: process.env.ETH_RPC_URL || 'https://eth-mainnet.g.alchemy.com/v2/demo',
  bsc: process.env.BNB_RPC_URL || 'https://bsc-dataseed.bnbchain.org',
};

// ERC-20 Transfer event signature
const TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)');

// Track last processed block per chain
const lastProcessedBlock: Record<string, number> = {};

export class DepositDetector {
  /**
   * Get all wallet addresses for monitoring
   */
  static async getMonitoredAddresses(): Promise<Map<string, { walletId: string; agentId: string; chain: string }>> {
    const { data: wallets } = await supabaseAdmin
      .from('wallets')
      .select('wallet_id, agent_id, address, chain')
      .in('chain', ['ethereum', 'bsc']);

    const addressMap = new Map();
    for (const wallet of wallets || []) {
      addressMap.set(wallet.address.toLowerCase(), {
        walletId: wallet.wallet_id,
        agentId: wallet.agent_id,
        chain: wallet.chain,
      });
    }
    return addressMap;
  }

  /**
   * Check for native token deposits (ETH/BNB)
   */
  static async checkNativeDeposits(chain: string): Promise<void> {
    try {
      const provider = new ethers.JsonRpcProvider(RPC_ENDPOINTS[chain]);
      const currentBlock = await provider.getBlockNumber();
      const fromBlock = lastProcessedBlock[chain] || currentBlock - 100;

      const addresses = await this.getMonitoredAddresses();
      const chainAddresses = [...addresses.entries()]
        .filter(([_, info]) => info.chain === chain)
        .map(([addr]) => addr);

      if (chainAddresses.length === 0) return;

      // Get blocks and check for transactions to our addresses
      for (let blockNum = fromBlock; blockNum <= currentBlock; blockNum++) {
        const block = await provider.getBlock(blockNum, true);
        if (!block || !block.transactions) continue;

        for (const txHash of block.transactions) {
          const tx = await provider.getTransaction(txHash as string);
          if (!tx || !tx.to) continue;

          const toAddress = tx.to.toLowerCase();
          if (addresses.has(toAddress)) {
            const walletInfo = addresses.get(toAddress)!;
            const amount = ethers.formatEther(tx.value);

            if (parseFloat(amount) > 0) {
              await this.recordDeposit(
                walletInfo.walletId,
                walletInfo.agentId,
                chain === 'ethereum' ? 'ETH' : 'BNB',
                amount,
                tx.from,
                tx.hash,
                chain
              );
            }
          }
        }
      }

      lastProcessedBlock[chain] = currentBlock;
      logger.info(`Processed ${chain} blocks ${fromBlock} to ${currentBlock}`);
    } catch (error) {
      logger.error(`Error checking ${chain} native deposits:`, error);
    }
  }

  /**
   * Check for ERC-20 token deposits
   */
  static async checkTokenDeposits(chain: string): Promise<void> {
    try {
      const provider = new ethers.JsonRpcProvider(RPC_ENDPOINTS[chain]);
      const currentBlock = await provider.getBlockNumber();
      const fromBlock = lastProcessedBlock[`${chain}_tokens`] || currentBlock - 100;

      const addresses = await this.getMonitoredAddresses();
      const tokens = TOKEN_CONTRACTS[chain];
      if (!tokens) return;

      // Get Transfer events for each token
      for (const [symbol, tokenAddress] of Object.entries(tokens)) {
        if (tokenAddress === '0x0' || tokenAddress === 'native') continue;

        const filter = {
          address: tokenAddress,
          topics: [TRANSFER_TOPIC],
          fromBlock,
          toBlock: currentBlock,
        };

        const logs = await provider.getLogs(filter);

        for (const log of logs) {
          // Decode transfer event
          const from = '0x' + log.topics[1].slice(26);
          const to = '0x' + log.topics[2].slice(26);
          const amount = BigInt(log.data);

          if (addresses.has(to.toLowerCase())) {
            const walletInfo = addresses.get(to.toLowerCase())!;
            const decimals = TOKEN_DECIMALS[symbol] || 18;
            const formattedAmount = ethers.formatUnits(amount, decimals);

            if (parseFloat(formattedAmount) > 0) {
              await this.recordDeposit(
                walletInfo.walletId,
                walletInfo.agentId,
                symbol,
                formattedAmount,
                from,
                log.transactionHash,
                chain
              );
            }
          }
        }
      }

      lastProcessedBlock[`${chain}_tokens`] = currentBlock;
    } catch (error) {
      logger.error(`Error checking ${chain} token deposits:`, error);
    }
  }

  /**
   * Record a deposit in the database
   */
  static async recordDeposit(
    walletId: string,
    agentId: string,
    currency: string,
    amount: string,
    fromAddress: string,
    txHash: string,
    chain: string
  ): Promise<void> {
    // Check if already recorded
    const { data: existing } = await supabaseAdmin
      .from('transactions')
      .select('tx_id')
      .eq('tx_hash', txHash)
      .single();

    if (existing) return; // Already recorded

    const txId = uuidv4();

    const { error } = await supabaseAdmin
      .from('transactions')
      .insert({
        tx_id: txId,
        wallet_id: walletId,
        type: 'deposit',
        amount,
        currency,
        from_address: fromAddress,
        to_address: '', // Our wallet
        tx_hash: txHash,
        status: 'confirmed',
        fee: '0',
        chain_fee: '0',
        chain_fee_usd: '0',
        bank_fee: '0',
        bank_fee_usd: '0',
        total_fee: '0',
        total_fee_usd: '0',
        total_deducted: amount,
        total_deducted_usd: '0',
        timestamp: new Date().toISOString(),
        metadata: {
          type: 'incoming_deposit',
          chain,
          detected_at: new Date().toISOString(),
        },
      });

    if (error) {
      logger.error(`Failed to record deposit: ${error.message}`);
      return;
    }

    logger.info(`Deposit detected: ${amount} ${currency} to wallet ${walletId} (tx: ${txHash})`);

    // Could trigger webhook notification here
    // await notifyAgent(agentId, 'deposit', { walletId, amount, currency, txHash });
  }

  /**
   * Run deposit detection for all chains
   */
  static async runDetection(): Promise<void> {
    logger.info('Running deposit detection...');
    
    await Promise.all([
      this.checkNativeDeposits('ethereum'),
      this.checkNativeDeposits('bsc'),
      this.checkTokenDeposits('ethereum'),
      this.checkTokenDeposits('bsc'),
    ]);
  }

  /**
   * Start periodic deposit detection
   */
  static startPeriodicDetection(intervalMs: number = 60000): NodeJS.Timeout {
    logger.info(`Starting deposit detection with ${intervalMs}ms interval`);
    
    // Run immediately
    this.runDetection();
    
    // Then run periodically
    return setInterval(() => this.runDetection(), intervalMs);
  }
}
