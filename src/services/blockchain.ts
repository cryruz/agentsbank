import { ethers, AbiCoder } from 'ethers';
import { Connection, PublicKey, Transaction, SystemProgram, sendAndConfirmTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getAssociatedTokenAddress, getAccount, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import * as bitcoin from 'bitcoinjs-lib';
import * as tinysecp from 'tiny-secp256k1';
import { logger } from '../utils/logger.js';
import { TOKEN_CONTRACTS, TOKEN_DECIMALS } from '../constants.js';
import axios from 'axios';

// Initialize secp256k1 for Bitcoin
bitcoin.initEccLib(tinysecp);

// Free public RPC endpoints from publicnode.com
const RPC_ENDPOINTS: Record<string, string> = {
  ethereum: process.env.ETH_RPC_URL || 'https://ethereum-rpc.publicnode.com',
  bsc: process.env.BNB_RPC_URL || 'https://bsc-rpc.publicnode.com',
  solana: process.env.SOL_RPC_URL || 'https://solana-rpc.publicnode.com',
  bitcoin: process.env.BTC_RPC_URL || 'https://bitcoin-rpc.publicnode.com',
};

// ERC-20 ABI for token transfers
const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function approve(address spender, uint256 amount) returns (bool)',
];

/**
 * Build ERC-20 token transfer transaction (Ethereum/BSC)
 */
export async function buildERC20Transfer(
  chain: string,
  privateKey: string,
  tokenAddress: string,
  toAddress: string,
  amount: string,
  decimals: number = 18
): Promise<{ signedTx: string; txData: any }> {
  try {
    const provider = new ethers.JsonRpcProvider(RPC_ENDPOINTS[chain]);
    const wallet = new ethers.Wallet(privateKey, provider);

    // Get nonce
    const nonce = await provider.getTransactionCount(wallet.address);

    // Parse amount with proper decimals
    const amountBigInt = ethers.parseUnits(amount, decimals);

    // Create contract interface
    const iface = new ethers.Interface(ERC20_ABI);
    const data = iface.encodeFunctionData('transfer', [toAddress, amountBigInt]);

    // Get gas price
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice || ethers.parseUnits('20', 'gwei');

    // Estimate gas
    const gasEstimate = await provider.estimateGas({
      from: wallet.address,
      to: tokenAddress,
      data: data,
      value: '0',
    });

    const txData = {
      to: tokenAddress,
      data: data,
      value: '0',
      gasLimit: (gasEstimate * BigInt(120)) / BigInt(100), // 20% buffer
      gasPrice: gasPrice,
      nonce: nonce,
      chainId: (await provider.getNetwork()).chainId,
    };

    // Sign transaction
    const signedTx = await wallet.signTransaction(txData);

    return { signedTx, txData };
  } catch (error) {
    logger.error('Failed to build ERC-20 transfer:', error);
    throw error;
  }
}

/**
 * Build native token transfer (ETH/BNB/etc)
 */
export async function buildNativeTransfer(
  chain: string,
  privateKey: string,
  toAddress: string,
  amount: string
): Promise<{ signedTx: string; txData: any }> {
  try {
    const provider = new ethers.JsonRpcProvider(RPC_ENDPOINTS[chain]);
    const wallet = new ethers.Wallet(privateKey, provider);

    const nonce = await provider.getTransactionCount(wallet.address);
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice || ethers.parseUnits('20', 'gwei');

    const txData = {
      to: toAddress,
      value: ethers.parseEther(amount),
      gasLimit: 21000,
      gasPrice: gasPrice,
      nonce: nonce,
      chainId: (await provider.getNetwork()).chainId,
    };

    const signedTx = await wallet.signTransaction(txData);

    return { signedTx, txData };
  } catch (error) {
    logger.error('Failed to build native transfer:', error);
    throw error;
  }
}

/**
 * Broadcast signed EVM transaction
 */
export async function broadcastEVMTransaction(
  chain: string,
  signedTx: string
): Promise<string> {
  try {
    const provider = new ethers.JsonRpcProvider(RPC_ENDPOINTS[chain]);
    const txResponse = await provider.broadcastTransaction(signedTx);
    logger.info(`EVM transaction broadcasted on ${chain}: ${txResponse.hash}`);
    return txResponse.hash;
  } catch (error) {
    logger.error('Failed to broadcast EVM transaction:', error);
    throw error;
  }
}

/**
 * Build Solana SOL transfer transaction
 * Note: SPL token transfers require additional implementation
 */
export async function buildSolanaTransfer(
  secretKeyHex: string,
  toAddress: string,
  amount: string
): Promise<{ signature: string }> {
  try {
    const { Keypair } = await import('@solana/web3.js');
    
    const secretKey = Uint8Array.from(Buffer.from(secretKeyHex, 'hex'));
    const keypair = Keypair.fromSecretKey(secretKey);
    
    const connection = new Connection(
      process.env.SOL_RPC_URL || 'https://api.mainnet-beta.solana.com',
      'confirmed'
    );
    
    const toPubkey = new PublicKey(toAddress);
    const lamports = Math.floor(parseFloat(amount) * LAMPORTS_PER_SOL);
    
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: toPubkey,
        lamports: lamports,
      })
    );
    
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = keypair.publicKey;
    
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [keypair],
      { commitment: 'confirmed' }
    );
    
    return { signature };
  } catch (error) {
    logger.error('Failed to build Solana transfer:', error);
    throw error;
  }
}

/**
 * Build and broadcast Bitcoin transaction
 * Uses Blockstream API for UTXO fetching and broadcasting
 */
export async function buildBitcoinTransaction(
  privateKeyHex: string,
  fromAddress: string,
  toAddress: string,
  amountBTC: string,
  feeRate: number = 20 // sat/vbyte
): Promise<{ txHash: string }> {
  try {
    const privateKeyBytes = Buffer.from(privateKeyHex, 'hex');
    
    // Create keypair
    const keyPair = {
      publicKey: Buffer.from(tinysecp.pointFromScalar(privateKeyBytes)!),
      privateKey: privateKeyBytes,
    };
    
    const satoshisToSend = BigInt(Math.floor(parseFloat(amountBTC) * 100000000));
    
    // Fetch UTXOs
    const utxoResponse = await axios.get(
      `https://blockstream.info/api/address/${fromAddress}/utxo`
    );
    const utxos: Array<{ txid: string; vout: number; value: number }> = utxoResponse.data;
    
    if (!utxos || utxos.length === 0) {
      throw new Error('No UTXOs available');
    }
    
    // Select UTXOs and calculate fee
    let totalAvailable = 0n;
    const selectedUtxos: Array<{ txid: string; vout: number; value: bigint }> = [];
    let estimatedSize = 10n + 31n * 2n;
    const feeRateBigInt = BigInt(feeRate);
    
    for (const utxo of utxos) {
      const utxoValue = BigInt(utxo.value);
      selectedUtxos.push({ ...utxo, value: utxoValue });
      totalAvailable += utxoValue;
      estimatedSize += 68n;
      
      const estimatedFee = estimatedSize * feeRateBigInt;
      if (totalAvailable >= satoshisToSend + estimatedFee) {
        break;
      }
    }
    
    const estimatedFee = estimatedSize * feeRateBigInt;
    if (totalAvailable < satoshisToSend + estimatedFee) {
      throw new Error('Insufficient BTC balance');
    }
    
    // Build PSBT
    const psbt = new bitcoin.Psbt({ network: bitcoin.networks.bitcoin });
    
    for (const utxo of selectedUtxos) {
      psbt.addInput({
        hash: utxo.txid,
        index: utxo.vout,
        witnessUtxo: {
          script: bitcoin.payments.p2wpkh({
            pubkey: keyPair.publicKey,
            network: bitcoin.networks.bitcoin,
          }).output!,
          value: utxo.value,
        },
      });
    }
    
    psbt.addOutput({
      address: toAddress,
      value: satoshisToSend,
    });
    
    const changeAmount = totalAvailable - satoshisToSend - estimatedFee;
    if (changeAmount > 546n) {
      psbt.addOutput({
        address: fromAddress,
        value: changeAmount,
      });
    }
    
    // Sign
    for (let i = 0; i < selectedUtxos.length; i++) {
      psbt.signInput(i, {
        publicKey: keyPair.publicKey,
        sign: (hash: Buffer) => Buffer.from(tinysecp.sign(hash, privateKeyBytes)!),
      });
    }
    
    psbt.finalizeAllInputs();
    const txHex = psbt.extractTransaction().toHex();
    
    // Broadcast
    const broadcastResponse = await axios.post(
      'https://blockstream.info/api/tx',
      txHex,
      { headers: { 'Content-Type': 'text/plain' } }
    );
    
    return { txHash: broadcastResponse.data };
  } catch (error) {
    logger.error('Failed to build Bitcoin transaction:', error);
    throw error;
  }
}

/**
 * Get transaction receipt and status (EVM chains)
 */
export async function getTransactionReceipt(
  chain: string,
  txHash: string
): Promise<{
  status: 'pending' | 'confirmed' | 'failed';
  blockNumber?: number;
  blockHash?: string;
  gasUsed?: string;
  confirmations?: number;
}> {
  try {
    const provider = new ethers.JsonRpcProvider(RPC_ENDPOINTS[chain]);
    const receipt = await provider.getTransactionReceipt(txHash);

    if (!receipt) {
      return { status: 'pending' };
    }

    const status = receipt.status === 1 ? 'confirmed' : 'failed';
    const currentBlock = await provider.getBlockNumber();
    const confirmations = currentBlock - (receipt.blockNumber || 0);

    return {
      status,
      blockNumber: receipt.blockNumber || undefined,
      blockHash: receipt.blockHash || undefined,
      gasUsed: receipt.gasUsed ? ethers.formatEther(receipt.gasUsed) : undefined,
      confirmations,
    };
  } catch (error) {
    logger.error('Failed to get transaction receipt:', error);
    throw error;
  }
}

/**
 * Poll for transaction confirmation
 */
export async function pollTransactionStatus(
  chain: string,
  txHash: string,
  maxAttempts: number = 60,
  delayMs: number = 10000
): Promise<{
  status: 'confirmed' | 'failed' | 'timeout';
  receipt?: any;
}> {
  let attempts = 0;

  while (attempts < maxAttempts) {
    try {
      const receipt = await getTransactionReceipt(chain, txHash);

      if (receipt.status !== 'pending') {
        return {
          status: receipt.status,
          receipt,
        };
      }

      attempts++;
      logger.info(
        `Polling transaction ${txHash}: attempt ${attempts}/${maxAttempts}`
      );

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    } catch (error) {
      logger.error('Error polling transaction:', error);
      attempts++;
    }
  }

  return { status: 'timeout' };
}

/**
 * Estimate gas for EVM transaction
 */
export async function estimateTransactionGas(
  chain: string,
  fromAddress: string,
  toAddress: string,
  amount: string,
  isToken: boolean = false,
  tokenAddress?: string
): Promise<{
  gasEstimate: string;
  gasPrice: string;
  totalCost: string;
}> {
  try {
    const provider = new ethers.JsonRpcProvider(RPC_ENDPOINTS[chain]);
    const feeData = await provider.getFeeData();
    const gasPrice = feeData?.gasPrice || ethers.parseUnits('20', 'gwei');

    let gasEstimate: bigint;

    if (isToken && tokenAddress) {
      const iface = new ethers.Interface(ERC20_ABI);
      const data = iface.encodeFunctionData('transfer', [toAddress, ethers.parseUnits(amount, 6)]);
      
      gasEstimate = await provider.estimateGas({
        from: fromAddress,
        to: tokenAddress,
        data: data,
        value: '0',
      });
    } else {
      gasEstimate = await provider.estimateGas({
        from: fromAddress,
        to: toAddress,
        value: ethers.parseEther(amount),
      });
    }

    const totalCost = gasEstimate * gasPrice;

    return {
      gasEstimate: gasEstimate.toString(),
      gasPrice: ethers.formatEther(gasPrice),
      totalCost: ethers.formatEther(totalCost),
    };
  } catch (error) {
    logger.error('Failed to estimate gas:', error);
    throw error;
  }
}

/**
 * Get account nonce for transaction sequencing
 */
export async function getAccountNonce(
  chain: string,
  address: string
): Promise<number> {
  try {
    const provider = new ethers.JsonRpcProvider(RPC_ENDPOINTS[chain]);
    const nonce = await provider.getTransactionCount(address);
    return nonce;
  } catch (error) {
    logger.error('Failed to get nonce:', error);
    throw error;
  }
}

/**
 * Get current gas prices
 */
export async function getGasPrices(chain: string): Promise<{
  standard: string;
  fast: string;
  slow: string;
}> {
  try {
    const provider = new ethers.JsonRpcProvider(RPC_ENDPOINTS[chain]);
    const feeData = await provider.getFeeData();

    if (!feeData.gasPrice) {
      throw new Error('Failed to fetch gas prices');
    }

    const standard = ethers.formatEther(feeData.gasPrice);
    const fast = ethers.formatEther((feeData.gasPrice * BigInt(120)) / BigInt(100));
    const slow = ethers.formatEther((feeData.gasPrice * BigInt(80)) / BigInt(100));

    return { standard, fast, slow };
  } catch (error) {
    logger.error('Failed to get gas prices:', error);
    throw error;
  }
}

/**
 * Get token balance (EVM chains)
 */
export async function getTokenBalance(
  chain: string,
  tokenAddress: string,
  walletAddress: string
): Promise<string> {
  try {
    const provider = new ethers.JsonRpcProvider(RPC_ENDPOINTS[chain]);
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    const balance = await contract.balanceOf(walletAddress);
    return balance.toString();
  } catch (error) {
    logger.error('Failed to get token balance:', error);
    throw error;
  }
}

/**
 * Get native balance (EVM chains)
 */
export async function getNativeBalance(
  chain: string,
  address: string
): Promise<string> {
  try {
    const provider = new ethers.JsonRpcProvider(RPC_ENDPOINTS[chain]);
    const balance = await provider.getBalance(address);
    return ethers.formatEther(balance);
  } catch (error) {
    logger.error('Failed to get native balance:', error);
    throw error;
  }
}

/**
 * Get Solana SOL balance
 */
export async function getSolanaBalance(address: string): Promise<string> {
  try {
    const connection = new Connection(
      process.env.SOL_RPC_URL || 'https://solana-rpc.publicnode.com',
      'confirmed'
    );
    const publicKey = new PublicKey(address);
    const balance = await connection.getBalance(publicKey);
    return (balance / LAMPORTS_PER_SOL).toFixed(9);
  } catch (error) {
    logger.error('Failed to get Solana balance:', error);
    throw error;
  }
}

/**
 * Get Bitcoin BTC balance via Blockstream API
 */
export async function getBitcoinBalance(address: string): Promise<string> {
  try {
    const response = await axios.get(
      `https://blockstream.info/api/address/${address}`
    );
    const { funded_txo_sum, spent_txo_sum } = response.data.chain_stats;
    const balanceSatoshis = funded_txo_sum - spent_txo_sum;
    return (balanceSatoshis / 100000000).toFixed(8);
  } catch (error) {
    logger.error('Failed to get Bitcoin balance:', error);
    throw error;
  }
}

/**
 * Get Solana SPL Token balance
 */
export async function getSPLTokenBalance(
  walletAddress: string,
  mintAddress: string,
  decimals: number = 6
): Promise<string> {
  try {
    const connection = new Connection(
      process.env.SOL_RPC_URL || 'https://solana-rpc.publicnode.com',
      'confirmed'
    );
    
    const walletPubkey = new PublicKey(walletAddress);
    const mintPubkey = new PublicKey(mintAddress);
    
    // Get associated token account
    const tokenAccount = await getAssociatedTokenAddress(
      mintPubkey,
      walletPubkey,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    
    try {
      const account = await getAccount(connection, tokenAccount);
      const balance = Number(account.amount) / Math.pow(10, decimals);
      return balance.toFixed(decimals);
    } catch (e: any) {
      // Account doesn't exist = 0 balance
      if (e.message?.includes('could not find account')) {
        return '0';
      }
      throw e;
    }
  } catch (error) {
    logger.error('Failed to get SPL token balance:', error);
    throw error;
  }
}
