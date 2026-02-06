/**
 * Token Transaction Examples
 * Demonstrates how to use AgentsBankSDK for USDT, USDC, and other token transfers
 * across Ethereum, BSC, Solana, and Bitcoin networks
 */

import { AgentsBankSDK } from '../src/sdk/index.js';

const bank = new AgentsBankSDK({
  apiUrl: 'https://api.agentsbank.ai',
  agentUsername: process.env.AGENT_USERNAME,
  agentPassword: process.env.AGENT_PASSWORD,
});

/**
 * Example 1: Send USDT on Ethereum
 */
async function sendUSDTOnEthereum() {
  console.log('📤 Sending 100 USDT on Ethereum...\n');

  // Get or create Ethereum wallet
  const wallet = await bank.createWallet('ethereum');
  console.log(`✓ Wallet created: ${wallet.address}`);

  // Estimate gas for USDT transfer
  const gasEstimate = await bank.estimateGasForTransaction(
    wallet.wallet_id,
    '0x742d35Cc6634C0532925a3b844Bc9e7595f1bEb', // recipient
    '100', // 100 USDT
    'USDT' // token
  );
  console.log(`✓ Gas estimate: ${gasEstimate.totalCost} ETH`);

  // Send USDT transfer
  const tx = await bank.sendTokenTransfer(
    wallet.wallet_id,
    '0x742d35Cc6634C0532925a3b844Bc9e7595f1bEb',
    '100',
    'USDT'
  );
  console.log(`✓ Transaction created: ${tx.tx_id}`);
  console.log(`  Status: ${tx.status}`);
  console.log(`  Amount: ${tx.amount} ${tx.currency}`);

  // Wait for confirmation
  const confirmed = await bank.waitForConfirmation(tx.tx_id);
  console.log(`✓ Transaction confirmed: ${confirmed.tx_hash}`);
}

/**
 * Example 2: Send USDC on BSC (Binance Smart Chain)
 */
async function sendUSDCOnBSC() {
  console.log('📤 Sending 50 USDC on BSC...\n');

  const wallet = await bank.createWallet('bsc');
  console.log(`✓ Wallet created: ${wallet.address}`);

  // Estimate gas
  const gasEstimate = await bank.estimateGasForTransaction(
    wallet.wallet_id,
    '0x742d35Cc6634C0532925a3b844Bc9e7595f1bEb',
    '50',
    'USDC'
  );
  console.log(`✓ Gas estimate: ${gasEstimate.totalCost} BNB`);

  // Send USDC
  const tx = await bank.sendTokenTransfer(
    wallet.wallet_id,
    '0x742d35Cc6634C0532925a3b844Bc9e7595f1bEb',
    '50',
    'USDC'
  );

  console.log(`✓ USDC transfer initiated: ${tx.tx_id}`);
}

/**
 * Example 3: Send native ETH
 */
async function sendNativeETH() {
  console.log('📤 Sending 0.5 ETH...\n');

  const wallet = await bank.createWallet('ethereum');

  // Send native ETH (default currency)
  const tx = await bank.sendTransaction(
    wallet.wallet_id,
    '0x742d35Cc6634C0532925a3b844Bc9e7595f1bEb',
    '0.5',
    'ETH'
  );

  console.log(`✓ ETH transfer: ${tx.tx_id}`);
}

/**
 * Example 4: Send native BNB
 */
async function sendNativeBNB() {
  console.log('📤 Sending 1 BNB...\n');

  const wallet = await bank.createWallet('bsc');

  const tx = await bank.sendTransaction(
    wallet.wallet_id,
    '0x742d35Cc6634C0532925a3b844Bc9e7595f1bEb',
    '1',
    'BNB'
  );

  console.log(`✓ BNB transfer: ${tx.tx_id}`);
}

/**
 * Example 5: Get transaction history
 */
async function getTransactionHistory() {
  console.log('📋 Getting transaction history...\n');

  const wallets = await bank.listWallets();
  const wallet = wallets[0];

  const history = await bank.getTransactionHistory(wallet.wallet_id, 20);

  console.log(`✓ Found ${history.length} transactions:\n`);
  for (const tx of history) {
    console.log(`  • ${tx.tx_id}`);
    console.log(`    Type: ${tx.type} | Amount: ${tx.amount} ${tx.currency}`);
    console.log(`    Status: ${tx.status} | Fee: ${tx.fee}`);
    console.log();
  }
}

/**
 * Example 6: Monitor transaction status
 */
async function monitorTransaction() {
  console.log('⏳ Monitoring transaction status...\n');

  const wallet = await bank.createWallet('ethereum');

  const tx = await bank.sendTokenTransfer(
    wallet.wallet_id,
    '0x742d35Cc6634C0532925a3b844Bc9e7595f1bEb',
    '25',
    'USDT'
  );

  console.log(`Transaction: ${tx.tx_id}`);
  console.log(`Status: ${tx.status}\n`);

  // Poll for updates
  let current = tx;
  while (current.status === 'pending') {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    current = await bank.getTransaction(tx.tx_id);
    console.log(`Status update: ${current.status}`);
  }

  console.log(`✓ Final status: ${current.status}`);
  if (current.tx_hash) {
    console.log(`Block hash: ${current.tx_hash}`);
  }
}

/**
 * Example 7: Token support across all chains
 */
async function demonstrateMultiChainTokenSupport() {
  console.log('🌍 Token support across chains:\n');

  const tokens = {
    ethereum: ['ETH', 'USDT', 'USDC'],
    bsc: ['BNB', 'USDT', 'USDC'],
    solana: ['SOL', 'USDT', 'USDC'],
    bitcoin: ['BTC'],
  };

  for (const [chain, supportedTokens] of Object.entries(tokens)) {
    console.log(`${chain.toUpperCase()}:`);
    for (const token of supportedTokens) {
      console.log(`  ✓ ${token}`);
    }
    console.log();
  }
}

/**
 * Example 8: Batch transfers
 */
async function batchTransfers() {
  console.log('📤 Executing batch transfers...\n');

  const recipients = [
    { address: '0x742d35Cc6634C0532925a3b844Bc9e7595f1bEb', amount: '10' },
    { address: '0x8ba1f109551bD432803012645Ac136ddd64DBA72', amount: '20' },
    { address: '0x2B6eD5aA5d8d8e38e93c1fEEd3fCdBc5d7f9c4Aa', amount: '15' },
  ];

  const wallet = await bank.createWallet('ethereum');
  const results = [];

  for (const recipient of recipients) {
    const tx = await bank.sendTokenTransfer(
      wallet.wallet_id,
      recipient.address,
      recipient.amount,
      'USDC'
    );
    results.push(tx);
    console.log(`✓ Transfer to ${recipient.address}: ${tx.tx_id}`);
  }

  console.log(`\n✓ Started ${results.length} transfers`);
  return results;
}

// Run examples
async function main() {
  try {
    console.log('🏦 AgentsBank.ai - Token Transaction Examples\n');
    console.log('='.repeat(50) + '\n');

    // Demonstrate available operations
    await demonstrateMultiChainTokenSupport();
    console.log('='.repeat(50) + '\n');

    console.log('✅ All examples ready to execute!\n');
    console.log('Use individual functions to test:');
    console.log('  - sendUSDTOnEthereum()');
    console.log('  - sendUSDCOnBSC()');
    console.log('  - sendNativeETH()');
    console.log('  - sendNativeBNB()');
    console.log('  - getTransactionHistory()');
    console.log('  - monitorTransaction()');
    console.log('  - batchTransfers()');
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

main();

export {
  sendUSDTOnEthereum,
  sendUSDCOnBSC,
  sendNativeETH,
  sendNativeBNB,
  getTransactionHistory,
  monitorTransaction,
  demonstrateMultiChainTokenSupport,
  batchTransfers,
};
