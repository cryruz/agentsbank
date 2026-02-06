import { ethers } from 'ethers';
import { supabase, supabaseAdmin, type Wallet } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import { SUPPORTED_CHAINS, TOKEN_CONTRACTS, TOKEN_DECIMALS } from '../constants.js';
import { encryptPrivateKey, decryptPrivateKey, hashPrivateKey } from '../utils/crypto.js';
import { getNativeBalance, getTokenBalance, getSolanaBalance, getBitcoinBalance, getSPLTokenBalance } from './blockchain.js';
import { Keypair, Connection, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL, sendAndConfirmTransaction } from '@solana/web3.js';
import { getAssociatedTokenAddress, createTransferInstruction, createAssociatedTokenAccountInstruction, getAccount, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import * as bitcoin from 'bitcoinjs-lib';
import * as tinysecp from 'tiny-secp256k1';
import axios from 'axios';

// Initialize secp256k1 for Bitcoin
bitcoin.initEccLib(tinysecp);

// Free public RPC endpoints from publicnode.com
const RPC_ENDPOINTS: Record<string, string> = {
  ethereum: process.env.ETH_RPC_URL || 'https://ethereum-rpc.publicnode.com',
  bsc: process.env.BNB_RPC_URL || 'https://bsc-rpc.publicnode.com',
  solana: process.env.SOL_RPC_URL || 'https://solana-rpc.publicnode.com',
};

export class WalletService {
  /**
   * Create custodial wallet for agent
   * Private key is encrypted with AES-256-GCM and stored securely
   * Agents NEVER see the private key - they interact via API only
   */
  static async createCustodialWallet(agentId: string, chain: string): Promise<Wallet> {
    // Generate new wallet
    const wallet = ethers.Wallet.createRandom();
    const address = wallet.address;
    const privateKey = wallet.privateKey;

    // Encrypt private key for secure storage (NOT hash - we need it for signing)
    const encryptedPrivateKey = encryptPrivateKey(privateKey);
    // Store hash for integrity verification
    const privateKeyHash = hashPrivateKey(privateKey);

    const walletId = uuidv4();

    const { data, error } = await supabaseAdmin
      .from('wallets')
      .insert({
        wallet_id: walletId,
        agent_id: agentId,
        chain,
        address,
        encrypted_private_key: encryptedPrivateKey,
        private_key_hash: privateKeyHash,
        balance: {
          native: '0',
        },
        type: 'custodial',
        created_at: new Date().toISOString(),
      })
      .select('wallet_id, agent_id, chain, address, type, created_at, private_key_hash, balance')
      .single();

    if (error) throw error;

    logger.info(`Custodial wallet created for agent ${agentId} on ${chain}: ${address}`);

    // Return wallet WITH wallet_id for subsequent operations
    return {
      wallet_id: data.wallet_id,
      agent_id: data.agent_id,
      chain: data.chain,
      address: data.address,
      type: data.type,
      created_at: data.created_at,
      private_key_hash: data.private_key_hash,
      balance: data.balance || {},
    };
  }

  /**
   * Get decrypted private key for signing (INTERNAL USE ONLY)
   * This should NEVER be exposed via API
   */
  private static async getPrivateKeyForSigning(walletId: string): Promise<string> {
    const { data, error } = await supabaseAdmin
      .from('wallets')
      .select('encrypted_private_key, private_key_hash')
      .eq('wallet_id', walletId)
      .single();

    if (error || !data?.encrypted_private_key) {
      throw new Error('Wallet not found or key not available');
    }

    // Decrypt the private key
    const privateKey = decryptPrivateKey(data.encrypted_private_key);

    // Verify integrity
    const actualHash = hashPrivateKey(privateKey);
    if (actualHash !== data.private_key_hash) {
      logger.error(`Key integrity check failed for wallet ${walletId}`);
      throw new Error('Key integrity verification failed');
    }

    return privateKey;
  }

  /**
   * Verify wallet has sufficient balance for transaction
   * Handles EVM, Solana, and Bitcoin chains
   */
  static async verifyBalance(
    walletId: string,
    amount: string,
    currency: string,
    estimatedGas: string = '0'
  ): Promise<{ sufficient: boolean; available: string; required: string; shortfall?: string }> {
    const wallet = await this.getWallet(walletId);
    const chain = wallet.chain;
    
    // Determine if native or token transfer
    const nativeTokens = ['ETH', 'BNB', 'SOL', 'BTC'];
    const isNative = nativeTokens.includes(currency.toUpperCase());
    
    let available: string;
    let required: number;
    
    // Handle non-EVM chains
    if (chain === 'solana') {
      if (isNative) {
        available = await getSolanaBalance(wallet.address);
        required = parseFloat(amount) + parseFloat(estimatedGas);
      } else {
        // SPL token balance
        const mintAddress = TOKEN_CONTRACTS['solana']?.[currency.toUpperCase()];
        if (!mintAddress || mintAddress === 'native') {
          throw new Error(`Token ${currency} not supported on Solana`);
        }
        const decimals = TOKEN_DECIMALS[currency.toUpperCase()] || 6;
        available = await getSPLTokenBalance(wallet.address, mintAddress, decimals);
        required = parseFloat(amount);
        
        // Check SOL for fees
        const solBalance = await getSolanaBalance(wallet.address);
        if (parseFloat(solBalance) < parseFloat(estimatedGas)) {
          return {
            sufficient: false,
            available: solBalance,
            required: estimatedGas,
            shortfall: (parseFloat(estimatedGas) - parseFloat(solBalance)).toFixed(9),
          };
        }
      }
    } else if (chain === 'bitcoin') {
      available = await getBitcoinBalance(wallet.address);
      required = parseFloat(amount) + parseFloat(estimatedGas);
    } else {
      // EVM chains (ethereum, bsc)
      if (isNative) {
        available = await getNativeBalance(chain, wallet.address);
        required = parseFloat(amount) + parseFloat(estimatedGas);
      } else {
        // ERC-20 token balance
        const tokenAddress = TOKEN_CONTRACTS[chain]?.[currency.toUpperCase()];
        if (!tokenAddress) {
          throw new Error(`Token ${currency} not supported on ${chain}`);
        }
        
        const tokenBalance = await getTokenBalance(chain, tokenAddress, wallet.address);
        const decimals = TOKEN_DECIMALS[currency.toUpperCase()] || 18;
        available = ethers.formatUnits(tokenBalance, decimals);
        required = parseFloat(amount);
        
        // Also verify gas balance
        const nativeBalance = await getNativeBalance(chain, wallet.address);
        if (parseFloat(nativeBalance) < parseFloat(estimatedGas)) {
          return {
            sufficient: false,
            available: nativeBalance,
            required: estimatedGas,
            shortfall: (parseFloat(estimatedGas) - parseFloat(nativeBalance)).toFixed(8),
          };
        }
      }
    }
    
    const sufficient = parseFloat(available) >= required;
    
    return {
      sufficient,
      available,
      required: required.toString(),
      shortfall: sufficient ? undefined : (required - parseFloat(available)).toFixed(8),
    };
  }

  /**
   * Sign and send a native token transaction (ETH, BNB, etc.)
   */
  static async signAndSendNativeTransaction(
    walletId: string,
    toAddress: string,
    amount: string,
    chain: string
  ): Promise<{ txHash: string; status: string; gasUsed?: string }> {
    const wallet = await this.getWallet(walletId);
    
    if (wallet.chain !== chain) {
      throw new Error(`Wallet is on ${wallet.chain}, not ${chain}`);
    }

    // Get decrypted private key (never exposed to agent)
    const privateKey = await this.getPrivateKeyForSigning(walletId);

    // Create signer
    const provider = new ethers.JsonRpcProvider(RPC_ENDPOINTS[chain]);
    const signer = new ethers.Wallet(privateKey, provider);

    // Verify balance before sending
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice || ethers.parseUnits('20', 'gwei');
    const estimatedGas = ethers.formatEther(gasPrice * 21000n);
    
    const balanceCheck = await this.verifyBalance(walletId, amount, chain === 'ethereum' ? 'ETH' : chain === 'bsc' ? 'BNB' : 'ETH', estimatedGas);
    if (!balanceCheck.sufficient) {
      throw new Error(`Insufficient balance. Available: ${balanceCheck.available}, Required: ${balanceCheck.required}, Shortfall: ${balanceCheck.shortfall}`);
    }

    // Build and send transaction
    const tx = await signer.sendTransaction({
      to: toAddress,
      value: ethers.parseEther(amount),
    });

    logger.info(`Native transaction sent from wallet ${walletId}: ${tx.hash}`);

    // Wait for confirmation
    const receipt = await tx.wait();

    return {
      txHash: tx.hash,
      status: receipt?.status === 1 ? 'confirmed' : 'failed',
      gasUsed: receipt?.gasUsed ? ethers.formatEther(receipt.gasUsed * (receipt.gasPrice || gasPrice)) : undefined,
    };
  }

  /**
   * Sign and send an ERC-20 token transaction (USDT, USDC, etc.)
   */
  static async signAndSendTokenTransaction(
    walletId: string,
    toAddress: string,
    amount: string,
    currency: string,
    chain: string
  ): Promise<{ txHash: string; status: string; gasUsed?: string }> {
    const wallet = await this.getWallet(walletId);
    
    if (wallet.chain !== chain) {
      throw new Error(`Wallet is on ${wallet.chain}, not ${chain}`);
    }

    // Get token contract address
    const tokenAddress = TOKEN_CONTRACTS[chain]?.[currency.toUpperCase()];
    if (!tokenAddress || tokenAddress === '0x0' || tokenAddress === 'native') {
      throw new Error(`Token ${currency} not supported on ${chain}`);
    }

    const decimals = TOKEN_DECIMALS[currency.toUpperCase()] || 18;

    // Get decrypted private key
    const privateKey = await this.getPrivateKeyForSigning(walletId);

    // Create signer
    const provider = new ethers.JsonRpcProvider(RPC_ENDPOINTS[chain]);
    const signer = new ethers.Wallet(privateKey, provider);

    // Estimate gas for token transfer
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice || ethers.parseUnits('20', 'gwei');
    const estimatedGas = ethers.formatEther(gasPrice * 65000n); // Token transfers use more gas

    // Verify token balance
    const balanceCheck = await this.verifyBalance(walletId, amount, currency, estimatedGas);
    if (!balanceCheck.sufficient) {
      throw new Error(`Insufficient ${currency} balance. Available: ${balanceCheck.available}, Required: ${balanceCheck.required}, Shortfall: ${balanceCheck.shortfall}`);
    }

    // ERC-20 ABI for transfer
    const ERC20_ABI = ['function transfer(address to, uint256 amount) returns (bool)'];
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);

    // Parse amount with proper decimals
    const amountBigInt = ethers.parseUnits(amount, decimals);

    // Send token transfer
    const tx = await contract.transfer(toAddress, amountBigInt);

    logger.info(`Token transaction sent from wallet ${walletId}: ${tx.hash}`);

    // Wait for confirmation
    const receipt = await tx.wait();

    return {
      txHash: tx.hash,
      status: receipt?.status === 1 ? 'confirmed' : 'failed',
      gasUsed: receipt?.gasUsed ? ethers.formatEther(receipt.gasUsed * (receipt.gasPrice || gasPrice)) : undefined,
    };
  }

  /**
   * Sign and send a transaction on behalf of an agent
   * Automatically detects chain type and routes to appropriate method
   */
  static async signAndSendTransaction(
    walletId: string,
    toAddress: string,
    amount: string,
    chain: string,
    currency?: string
  ): Promise<{ txHash: string; status: string; gasUsed?: string }> {
    // Determine currency based on chain if not provided
    const effectiveCurrency = currency || this.getNativeToken(chain);
    
    // Route based on chain type
    if (chain === 'solana') {
      // Solana: native SOL or SPL tokens
      if (effectiveCurrency.toUpperCase() === 'SOL') {
        return this.signAndSendSolanaTransaction(walletId, toAddress, amount);
      } else {
        // SPL token transfer (USDC, USDT, etc.)
        return this.signAndSendSPLTokenTransaction(walletId, toAddress, amount, effectiveCurrency);
      }
    }
    
    if (chain === 'bitcoin') {
      // Bitcoin only supports BTC
      if (effectiveCurrency.toUpperCase() !== 'BTC') {
        throw new Error('Bitcoin only supports BTC transfers');
      }
      return this.signAndSendBitcoinTransaction(walletId, toAddress, amount);
    }
    
    // EVM chains (ethereum, bsc)
    const nativeTokens: Record<string, string> = {
      ethereum: 'ETH',
      bsc: 'BNB',
    };
    
    const isNative = effectiveCurrency.toUpperCase() === nativeTokens[chain];
    
    if (isNative) {
      return this.signAndSendNativeTransaction(walletId, toAddress, amount, chain);
    } else {
      return this.signAndSendTokenTransaction(walletId, toAddress, amount, effectiveCurrency, chain);
    }
  }

  /**
   * Get native token symbol for chain
   */
  static getNativeToken(chain: string): string {
    const nativeTokens: Record<string, string> = {
      ethereum: 'ETH',
      bsc: 'BNB',
      solana: 'SOL',
      bitcoin: 'BTC',
    };
    return nativeTokens[chain] || 'ETH';
  }

  /**
   * Sign a message on behalf of an agent (for authentication, etc.)
   * FIX #2: Handle chain-specific key formats (Solana: Uint8Array, EVM: 0x-prefixed hex)
   */
  static async signMessage(walletId: string, message: string): Promise<string> {
    const wallet = await this.getWallet(walletId);
    const privateKey = await this.getPrivateKeyForSigning(walletId);
    
    // Handle Solana: convert hex to Uint8Array
    if (wallet.chain === 'solana') {
      const solanaKey = new Uint8Array(Buffer.from(privateKey.slice(2), 'hex'));
      const solanaWallet = nacl.sign.keyPair.fromSecretKey(solanaKey);
      const messageUint8 = new TextEncoder().encode(message);
      const signature = nacl.sign.detached(messageUint8, solanaWallet.secretKey);
      return Buffer.from(signature).toString('base64');
    }
    
    // Handle EVM chains (Ethereum, BSC): ensure 0x prefix and proper length
    const evmKey = privateKey.startsWith('0x') ? privateKey : '0x' + privateKey;
    if (evmKey.length !== 66) {
      throw new Error(`Invalid EVM private key format for chain ${wallet.chain}`);
    }
    
    const evmWallet = new ethers.Wallet(evmKey);
    return evmWallet.signMessage(message);
  }

  /**
   * Get all balances for a wallet (native + tokens)
   */
  static async getAllBalances(walletId: string): Promise<Record<string, string>> {
    const wallet = await this.getWallet(walletId);
    const chain = wallet.chain;
    const balances: Record<string, string> = {};
    
    // Handle non-EVM chains
    if (chain === 'solana') {
      try {
        balances['SOL'] = await getSolanaBalance(wallet.address);
      } catch (e) {
        balances['SOL'] = '0';
      }
      
      // Get SPL token balances
      const solanaTokens = TOKEN_CONTRACTS['solana'];
      if (solanaTokens) {
        for (const [symbol, mintAddress] of Object.entries(solanaTokens)) {
          if (mintAddress !== 'native' && symbol !== 'SOL') {
            try {
              const decimals = TOKEN_DECIMALS[symbol] || 6;
              balances[symbol] = await getSPLTokenBalance(wallet.address, mintAddress, decimals);
            } catch (e) {
              balances[symbol] = '0';
            }
          }
        }
      }
      return balances;
    }
    
    if (chain === 'bitcoin') {
      try {
        balances['BTC'] = await getBitcoinBalance(wallet.address);
      } catch (e) {
        balances['BTC'] = '0';
      }
      return balances;
    }
    
    // EVM chains
    const nativeToken = this.getNativeToken(chain);
    balances[nativeToken] = await getNativeBalance(chain, wallet.address);
    
    // Get token balances for this chain
    const tokens = TOKEN_CONTRACTS[chain];
    if (tokens) {
      for (const [symbol, address] of Object.entries(tokens)) {
        if (address !== '0x0' && address !== 'native' && symbol !== nativeToken) {
          try {
            const balance = await getTokenBalance(chain, address, wallet.address);
            const decimals = TOKEN_DECIMALS[symbol] || 18;
            balances[symbol] = ethers.formatUnits(balance, decimals);
          } catch (e) {
            balances[symbol] = '0';
          }
        }
      }
    }
    
    return balances;
  }

  /**
   * Get wallet by ID (public info only - no encrypted keys)
   */
  static async getWallet(walletId: string): Promise<Wallet> {
    const { data, error } = await supabaseAdmin
      .from('wallets')
      .select('wallet_id, agent_id, chain, address, balance, type, created_at, private_key_hash')
      .eq('wallet_id', walletId)
      .single();

    if (error) {
      logger.error(`Error fetching wallet ${walletId}:`, error);
      throw new Error(`Wallet not found: ${error.message}`);
    }

    if (!data) {
      throw new Error('Wallet not found');
    }

    // Never return encrypted key or hash to API consumers
    return {
      wallet_id: data.wallet_id,
      agent_id: data.agent_id,
      chain: data.chain,
      address: data.address,
      balance: data.balance,
      type: data.type,
      created_at: data.created_at,
      private_key_hash: null,
    };
  }

  /**
   * List wallets for agent (public info only - no encrypted keys)
   */
  static async listWallets(agentId: string): Promise<Wallet[]> {
    const { data, error } = await supabaseAdmin
      .from('wallets')
      .select('wallet_id, agent_id, chain, address, balance, type, created_at')
      .eq('agent_id', agentId);

    if (error) throw error;
    return (data || []).map(w => ({ ...w, private_key_hash: null }));
  }

  /**
   * Update wallet balance
   */
  static async updateBalance(walletId: string, balance: Record<string, string>): Promise<void> {
    const { error } = await supabaseAdmin
      .from('wallets')
      .update({ balance })
      .eq('wallet_id', walletId);

    if (error) throw error;

    logger.info(`Wallet balance updated: ${walletId}`);
  }

  /**
   * Get balance from blockchain (handles all chains)
   */
  static async fetchBalance(address: string, chain: string): Promise<string> {
    try {
      if (chain === 'solana') {
        return await getSolanaBalance(address);
      }
      if (chain === 'bitcoin') {
        return await getBitcoinBalance(address);
      }
      // EVM chains
      const provider = new ethers.JsonRpcProvider(RPC_ENDPOINTS[chain]);
      const balance = await provider.getBalance(address);
      return ethers.formatEther(balance);
    } catch (error) {
      logger.error(`Failed to fetch balance for ${address} on ${chain}:`, error);
      throw error;
    }
  }

  /**
   * Estimate gas for transaction
   */
  static async estimateGas(
    chain: string,
    toAddress: string,
    amount: string
  ): Promise<string> {
    try {
      const provider = new ethers.JsonRpcProvider(RPC_ENDPOINTS[chain]);

      const tx = {
        to: toAddress,
        value: ethers.parseEther(amount),
      };

      const gasEstimate = await provider.estimateGas(tx);
      const gasPriceResponse = await provider.getFeeData();
      const gasPrice = gasPriceResponse?.gasPrice || ethers.parseUnits('20', 'gwei');
      const gasCost = gasEstimate * gasPrice;

      return ethers.formatEther(gasCost);
    } catch (error) {
      logger.error(`Failed to estimate gas on ${chain}:`, error);
      throw error;
    }
  }

  /**
   * Get wallet transaction history
   */
  static async getTransactionHistory(walletId: string, limit: number = 50): Promise<any[]> {
    const { data, error } = await supabase
      .from('transactions')
      .select()
      .eq('wallet_id', walletId)
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  }

  /**
   * Create wallets for all supported chains for an agent
   * Called during agent registration
   */
  static async createWalletsForAllChains(agentId: string): Promise<Wallet[]> {
    const wallets: Wallet[] = [];

    for (const chain of SUPPORTED_CHAINS) {
      try {
        let wallet: Wallet;

        // Use appropriate wallet creation method based on chain type
        if (chain.id === 'bitcoin') {
          wallet = await this.createBitcoinWallet(agentId);
        } else if (chain.id === 'solana') {
          wallet = await this.createSolanaWallet(agentId);
        } else {
          // EVM chains (ethereum, bsc)
          wallet = await this.createCustodialWallet(agentId, chain.id);
        }

        wallets.push(wallet);
        logger.info(`Wallet created for agent ${agentId} on ${chain.name}`);
      } catch (error) {
        logger.error(`Failed to create wallet for agent ${agentId} on ${chain.id}:`, error);
        // Continue creating other wallets even if one fails
      }
    }

    return wallets;
  }

  /**
   * Create Bitcoin wallet for agent using bitcoinjs-lib
   * Generates native SegWit (bech32) address for lower fees
   */
  static async createBitcoinWallet(agentId: string): Promise<Wallet> {
    // Generate random 32 bytes for private key
    const privateKeyBytes = crypto.getRandomValues(new Uint8Array(32));
    const privateKeyHex = Buffer.from(privateKeyBytes).toString('hex');
    
    // Create keypair using tiny-secp256k1
    const keyPair = {
      publicKey: Buffer.from(tinysecp.pointFromScalar(privateKeyBytes)!),
      privateKey: Buffer.from(privateKeyBytes),
    };
    
    // Generate native SegWit (P2WPKH) address for mainnet
    const { address } = bitcoin.payments.p2wpkh({
      pubkey: keyPair.publicKey,
      network: bitcoin.networks.bitcoin,
    });
    
    if (!address) {
      throw new Error('Failed to generate Bitcoin address');
    }
    
    // Encrypt private key for secure storage
    const encryptedPrivateKey = encryptPrivateKey(privateKeyHex);
    const privateKeyHash = hashPrivateKey(privateKeyHex);
    
    const walletId = uuidv4();

    const { data, error } = await supabaseAdmin
      .from('wallets')
      .insert({
        wallet_id: walletId,
        agent_id: agentId,
        chain: 'bitcoin',
        address: address,
        encrypted_private_key: encryptedPrivateKey,
        private_key_hash: privateKeyHash,
        balance: {
          BTC: '0',
        },
        type: 'custodial',
        created_at: new Date().toISOString(),
      })
      .select('wallet_id, agent_id, chain, address, type, created_at, private_key_hash, balance')
      .single();

    if (error) throw error;

    logger.info(`Bitcoin wallet created for agent ${agentId}: ${address}`);
    return {
      wallet_id: data.wallet_id,
      agent_id: data.agent_id,
      chain: data.chain,
      address: data.address,
      type: data.type,
      created_at: data.created_at,
      private_key_hash: data.private_key_hash,
      balance: data.balance || {},
    };
  }

  /**
   * Sign and send Bitcoin transaction
   * Uses Blockstream API for UTXO fetching and broadcasting
   */
  static async signAndSendBitcoinTransaction(
    walletId: string,
    toAddress: string,
    amount: string // in BTC
  ): Promise<{ txHash: string; status: string }> {
    const wallet = await this.getWallet(walletId);
    
    if (wallet.chain !== 'bitcoin') {
      throw new Error(`Wallet is on ${wallet.chain}, not bitcoin`);
    }

    // Get decrypted private key
    const privateKeyHex = await this.getPrivateKeyForSigning(walletId);
    const privateKeyBytes = Buffer.from(privateKeyHex, 'hex');
    
    // Create keypair
    const keyPair = {
      publicKey: Buffer.from(tinysecp.pointFromScalar(privateKeyBytes)!),
      privateKey: privateKeyBytes,
    };

    // Amount in satoshis (using BigInt for bitcoinjs-lib v7)
    const satoshisToSend = BigInt(Math.floor(parseFloat(amount) * 100000000));
    
    // Fetch UTXOs from Blockstream API
    const utxoResponse = await axios.get(
      `https://blockstream.info/api/address/${wallet.address}/utxo`
    );
    const utxos: Array<{ txid: string; vout: number; value: number }> = utxoResponse.data;
    
    if (!utxos || utxos.length === 0) {
      throw new Error('No UTXOs available for this address');
    }

    // Calculate total available and select UTXOs
    let totalAvailable = 0n;
    const selectedUtxos: Array<{ txid: string; vout: number; value: bigint }> = [];
    
    // Estimate fee (20 sat/vbyte for P2WPKH, ~110 vbytes per input, ~31 per output)
    const feeRate = 20n; // sat/vbyte
    let estimatedSize = 10n + 31n * 2n; // Base + 2 outputs (recipient + change)
    
    for (const utxo of utxos) {
      const utxoValue = BigInt(utxo.value);
      selectedUtxos.push({ ...utxo, value: utxoValue });
      totalAvailable += utxoValue;
      estimatedSize += 68n; // ~68 vbytes per P2WPKH input
      
      const estimatedFee = estimatedSize * feeRate;
      if (totalAvailable >= satoshisToSend + estimatedFee) {
        break;
      }
    }

    const estimatedFee = estimatedSize * feeRate;
    if (totalAvailable < satoshisToSend + estimatedFee) {
      const available = (Number(totalAvailable) / 100000000).toFixed(8);
      const required = (Number(satoshisToSend + estimatedFee) / 100000000).toFixed(8);
      throw new Error(`Insufficient BTC balance. Available: ${available}, Required: ${required}`);
    }

    // Build transaction using Psbt
    const psbt = new bitcoin.Psbt({ network: bitcoin.networks.bitcoin });
    
    // Add inputs
    for (const utxo of selectedUtxos) {
      // Fetch raw transaction for non-witness UTXO
      const txHexResponse = await axios.get(
        `https://blockstream.info/api/tx/${utxo.txid}/hex`
      );
      
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

    // Add recipient output
    psbt.addOutput({
      address: toAddress,
      value: satoshisToSend,
    });

    // Add change output if there's enough change
    const changeAmount = totalAvailable - satoshisToSend - estimatedFee;
    if (changeAmount > 546n) { // Dust threshold
      psbt.addOutput({
        address: wallet.address,
        value: changeAmount,
      });
    }

    // Sign all inputs
    for (let i = 0; i < selectedUtxos.length; i++) {
      psbt.signInput(i, {
        publicKey: keyPair.publicKey,
        sign: (hash: Buffer) => Buffer.from(tinysecp.sign(hash, privateKeyBytes)!),
      });
    }

    // Finalize and extract transaction
    psbt.finalizeAllInputs();
    const txHex = psbt.extractTransaction().toHex();

    // Broadcast via Blockstream API
    const broadcastResponse = await axios.post(
      'https://blockstream.info/api/tx',
      txHex,
      { headers: { 'Content-Type': 'text/plain' } }
    );

    const txHash = broadcastResponse.data;
    logger.info(`Bitcoin transaction sent from wallet ${walletId}: ${txHash}`);

    return {
      txHash,
      status: 'pending', // Bitcoin requires confirmations
    };
  }

  /**
   * Create Solana wallet for agent using @solana/web3.js Keypair
   * Private key stored as base58 encoded secret key
   */
  static async createSolanaWallet(agentId: string): Promise<Wallet> {
    // Generate real Solana keypair
    const keypair = Keypair.generate();
    const publicKey = keypair.publicKey.toBase58();
    
    // Store secret key as hex string (64 bytes = 128 hex chars)
    const secretKeyHex = Buffer.from(keypair.secretKey).toString('hex');
    
    // Encrypt secret key for secure storage
    const encryptedPrivateKey = encryptPrivateKey(secretKeyHex);
    const privateKeyHash = hashPrivateKey(secretKeyHex);

    const walletId = uuidv4();

    const { data, error } = await supabaseAdmin
      .from('wallets')
      .insert({
        wallet_id: walletId,
        agent_id: agentId,
        chain: 'solana',
        address: publicKey,
        encrypted_private_key: encryptedPrivateKey,
        private_key_hash: privateKeyHash,
        balance: {
          SOL: '0',
        },
        type: 'custodial',
        created_at: new Date().toISOString(),
      })
      .select('wallet_id, agent_id, chain, address, type, created_at, private_key_hash, balance')
      .single();

    if (error) throw error;

    logger.info(`Solana wallet created for agent ${agentId}: ${publicKey}`);
    return {
      wallet_id: data.wallet_id,
      agent_id: data.agent_id,
      chain: data.chain,
      address: data.address,
      type: data.type,
      created_at: data.created_at,
      private_key_hash: data.private_key_hash,
      balance: data.balance || {},
    };
  }

  /**
   * Sign and send Solana SOL transfer
   */
  static async signAndSendSolanaTransaction(
    walletId: string,
    toAddress: string,
    amount: string
  ): Promise<{ txHash: string; status: string }> {
    const wallet = await this.getWallet(walletId);
    
    if (wallet.chain !== 'solana') {
      throw new Error(`Wallet is on ${wallet.chain}, not solana`);
    }

    // Get decrypted secret key
    const secretKeyHex = await this.getPrivateKeyForSigning(walletId);
    const secretKey = Uint8Array.from(Buffer.from(secretKeyHex, 'hex'));
    const keypair = Keypair.fromSecretKey(secretKey);

    // Connect to Solana (using PublicNode)
    const connection = new Connection(
      process.env.SOL_RPC_URL || 'https://solana-rpc.publicnode.com',
      'confirmed'
    );

    // Verify balance
    const balance = await connection.getBalance(keypair.publicKey);
    const lamportsToSend = Math.floor(parseFloat(amount) * LAMPORTS_PER_SOL);
    const estimatedFee = 5000; // ~0.000005 SOL typical fee
    
    if (balance < lamportsToSend + estimatedFee) {
      const available = (balance / LAMPORTS_PER_SOL).toFixed(9);
      const required = ((lamportsToSend + estimatedFee) / LAMPORTS_PER_SOL).toFixed(9);
      throw new Error(`Insufficient SOL balance. Available: ${available}, Required: ${required}`);
    }

    // Build transaction
    const toPubkey = new PublicKey(toAddress);
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: toPubkey,
        lamports: lamportsToSend,
      })
    );

    // Get recent blockhash
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = keypair.publicKey;

    // Sign and send
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [keypair],
      { commitment: 'confirmed' }
    );

    logger.info(`Solana transaction sent from wallet ${walletId}: ${signature}`);

    return {
      txHash: signature,
      status: 'confirmed',
    };
  }

  /**
   * Sign and send Solana SPL token transfer (USDC, USDT, etc.)
   */
  static async signAndSendSPLTokenTransaction(
    walletId: string,
    toAddress: string,
    amount: string,
    tokenSymbol: string
  ): Promise<{ txHash: string; status: string }> {
    const wallet = await this.getWallet(walletId);
    
    if (wallet.chain !== 'solana') {
      throw new Error(`Wallet is on ${wallet.chain}, not solana`);
    }

    // Get token mint address
    const mintAddress = TOKEN_CONTRACTS['solana']?.[tokenSymbol.toUpperCase()];
    if (!mintAddress || mintAddress === 'native') {
      throw new Error(`SPL Token ${tokenSymbol} not supported on Solana`);
    }

    const decimals = TOKEN_DECIMALS[tokenSymbol.toUpperCase()] || 6;

    // Get decrypted secret key
    const secretKeyHex = await this.getPrivateKeyForSigning(walletId);
    const secretKey = Uint8Array.from(Buffer.from(secretKeyHex, 'hex'));
    const keypair = Keypair.fromSecretKey(secretKey);

    // Connect to Solana (using PublicNode)
    const connection = new Connection(
      process.env.SOL_RPC_URL || 'https://solana-rpc.publicnode.com',
      'confirmed'
    );

    const mintPubkey = new PublicKey(mintAddress);
    const toPubkey = new PublicKey(toAddress);
    
    // Get or create associated token accounts
    const fromTokenAccount = await getAssociatedTokenAddress(
      mintPubkey,
      keypair.publicKey,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    
    const toTokenAccount = await getAssociatedTokenAddress(
      mintPubkey,
      toPubkey,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    // Check sender's token balance
    try {
      const fromAccount = await getAccount(connection, fromTokenAccount);
      const tokenAmount = BigInt(Math.floor(parseFloat(amount) * Math.pow(10, decimals)));
      
      if (fromAccount.amount < tokenAmount) {
        const available = Number(fromAccount.amount) / Math.pow(10, decimals);
        throw new Error(`Insufficient ${tokenSymbol} balance. Available: ${available.toFixed(decimals)}, Required: ${amount}`);
      }
    } catch (e: any) {
      if (e.message?.includes('could not find account')) {
        throw new Error(`No ${tokenSymbol} token account found. Deposit ${tokenSymbol} first.`);
      }
      throw e;
    }

    // Check SOL for fees
    const solBalance = await connection.getBalance(keypair.publicKey);
    const estimatedFee = 10000; // ~0.00001 SOL for token transfer
    if (solBalance < estimatedFee) {
      throw new Error(`Insufficient SOL for fees. Need at least 0.00001 SOL`);
    }

    // Build transaction
    const transaction = new Transaction();
    
    // Check if recipient has a token account, if not create it
    try {
      await getAccount(connection, toTokenAccount);
    } catch (e: any) {
      if (e.message?.includes('could not find account')) {
        // Create associated token account for recipient
        transaction.add(
          createAssociatedTokenAccountInstruction(
            keypair.publicKey, // payer
            toTokenAccount,    // associated token account
            toPubkey,          // owner
            mintPubkey,        // mint
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
          )
        );
      }
    }

    // Add transfer instruction
    const tokenAmount = BigInt(Math.floor(parseFloat(amount) * Math.pow(10, decimals)));
    transaction.add(
      createTransferInstruction(
        fromTokenAccount,   // source
        toTokenAccount,     // destination
        keypair.publicKey,  // owner
        tokenAmount,        // amount
        [],                 // multiSigners
        TOKEN_PROGRAM_ID
      )
    );

    // Get recent blockhash
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = keypair.publicKey;

    // Sign and send
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [keypair],
      { commitment: 'confirmed' }
    );

    logger.info(`SPL Token transaction sent from wallet ${walletId}: ${signature}`);

    return {
      txHash: signature,
      status: 'confirmed',
    };
  }
}
