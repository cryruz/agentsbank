export const API_VERSION = 'v1';

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
} as const;

export const CHAINS = {
  ETH: 'ethereum',
  BNB: 'bsc',
  SOL: 'solana',
  BTC: 'bitcoin',
} as const;

export const TRANSACTION_TYPES = {
  DEPOSIT: 'deposit',
  TRANSFER: 'transfer',
  SWAP: 'swap',
  STAKE: 'stake',
  UNSTAKE: 'unstake',
  WITHDRAW: 'withdraw',
} as const;

export const TRANSACTION_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  FAILED: 'failed',
} as const;

export const AGENT_STATUS = {
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  ARCHIVED: 'archived',
} as const;

export const WALLET_TYPES = {
  CUSTODIAL: 'custodial',
  NON_CUSTODIAL: 'non-custodial',
} as const;

// Token contract addresses
export const TOKEN_CONTRACTS: Record<string, Record<string, string>> = {
  ethereum: {
    // Native ETH uses 0x0
    ETH: '0x0',
    USDT: '0xdac17f958d2ee523a2206206994597c13d831ec7',
    USDC: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  },
  bsc: {
    // Native BNB uses 0x0
    BNB: '0x0',
    USDT: '0x55d398326f99059fF775485246999027B3197955',
    USDC: '0x8AC76a51cc950d9822D68b83FE1Ad97B32Cd580d',
  },
  solana: {
    // Native SOL uses native token
    SOL: 'native',
    // Official USDT on Solana (Tether)
    USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwCB',
    // Official USDC on Solana (Circle)
    USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  },
  bitcoin: {
    // Bitcoin only has native BTC
    BTC: 'native',
  },
};

// Decimals for tokens
export const TOKEN_DECIMALS: Record<string, number> = {
  ETH: 18,
  BNB: 18,
  SOL: 9,
  BTC: 8,
  USDT: 6,
  USDC: 6,
} as const;

// Supported chains catalogue for wallet creation
export const SUPPORTED_CHAINS = [
  {
    id: 'ethereum',
    name: 'Ethereum',
    symbol: 'ETH',
    nativeToken: 'ETH',
    decimals: 18,
    tokens: ['ETH', 'USDT', 'USDC'],
    chainId: 1,
    explorer: 'https://etherscan.io',
  },
  {
    id: 'bsc',
    name: 'BNB Smart Chain',
    symbol: 'BNB',
    nativeToken: 'BNB',
    decimals: 18,
    tokens: ['BNB', 'USDT', 'USDC'],
    chainId: 56,
    explorer: 'https://bscscan.com',
  },
  {
    id: 'solana',
    name: 'Solana',
    symbol: 'SOL',
    nativeToken: 'SOL',
    decimals: 9,
    tokens: ['SOL', 'USDT', 'USDC'],
    chainId: null, // Solana doesn't use EVM chain IDs
    explorer: 'https://explorer.solana.com',
  },
  {
    id: 'bitcoin',
    name: 'Bitcoin',
    symbol: 'BTC',
    nativeToken: 'BTC',
    decimals: 8,
    tokens: ['BTC'],
    chainId: null,
    explorer: 'https://blockstream.info',
  },
] as const;

export type SupportedChain = typeof SUPPORTED_CHAINS[number];

// ============================================
// FEE CONFIGURATION
// ============================================

// AgentsBank platform fees (percentage of transaction amount)
export const BANK_FEES = {
  // Base fee percentage (0.5%)
  BASE_PERCENTAGE: 0.005,
  
  // Minimum fee in USD equivalent
  MIN_FEE_USD: 0.01,
  
  // Maximum fee in USD equivalent (cap)
  MAX_FEE_USD: 100,
  
  // Fee tiers based on monthly volume (in USD)
  TIERS: [
    { min_volume: 0, max_volume: 1000, percentage: 0.01 },        // 1% for < $1k
    { min_volume: 1000, max_volume: 10000, percentage: 0.0075 },  // 0.75% for $1k-$10k
    { min_volume: 10000, max_volume: 100000, percentage: 0.005 }, // 0.5% for $10k-$100k
    { min_volume: 100000, max_volume: Infinity, percentage: 0.0025 }, // 0.25% for > $100k
  ],
  
  // Per-chain fee adjustments (multiplier)
  CHAIN_MULTIPLIERS: {
    ethereum: 1.0,
    bsc: 0.8,      // 20% discount on BSC
    solana: 0.7,   // 30% discount on Solana
    bitcoin: 1.2,  // 20% premium on Bitcoin
  } as Record<string, number>,
} as const;

// Estimated chain fees (gas) in native token - updated dynamically
export const ESTIMATED_CHAIN_FEES = {
  ethereum: {
    native_transfer: '0.002',    // ~$5 at $2500/ETH
    token_transfer: '0.004',     // ~$10 at $2500/ETH
    swap: '0.008',               // ~$20 at $2500/ETH
    currency: 'ETH',
  },
  bsc: {
    native_transfer: '0.0001',   // ~$0.03 at $300/BNB
    token_transfer: '0.0002',    // ~$0.06 at $300/BNB
    swap: '0.0005',              // ~$0.15 at $300/BNB
    currency: 'BNB',
  },
  solana: {
    native_transfer: '0.000005', // ~$0.001 at $200/SOL
    token_transfer: '0.00001',   // ~$0.002 at $200/SOL
    swap: '0.00002',             // ~$0.004 at $200/SOL
    currency: 'SOL',
  },
  bitcoin: {
    native_transfer: '0.00001',  // ~$0.50 at $50k/BTC (depends on mempool)
    token_transfer: '0',         // BTC doesn't have tokens
    swap: '0',                   // No native swaps
    currency: 'BTC',
  },
} as const;

// Minimum transaction amounts per chain (in USD)
// Based on typical gas costs to ensure transaction is economically viable
export const MINIMUM_TRANSACTION_USD: Record<string, number> = {
  ethereum: 10.00,    // ETH mainnet gas is expensive (~$5-20)
  bsc: 0.50,          // BSC is cheap (~$0.05-0.10)
  solana: 0.10,       // Solana is very cheap (~$0.001)
  bitcoin: 20.00,     // BTC fees can be high (~$1-10+ depending on mempool)
};

// Minimum transaction amounts per token (in native token)
// Some tokens have dust limits or practical minimums
export const MINIMUM_TRANSACTION_NATIVE: Record<string, Record<string, string>> = {
  ethereum: {
    ETH: '0.005',      // ~$12.50 at $2500/ETH
    USDT: '10',        // $10 minimum for stablecoins
    USDC: '10',
  },
  bsc: {
    BNB: '0.002',      // ~$0.60 at $300/BNB  
    USDT: '1',         // $1 minimum
    USDC: '1',
  },
  solana: {
    SOL: '0.05',       // ~$10 at $200/SOL
    USDT: '0.10',      // $0.10 minimum
    USDC: '0.10',
  },
  bitcoin: {
    BTC: '0.0005',     // ~$25 at $50k/BTC (dust limit consideration)
  },
};

// Recommended minimum for good UX (covers fees + leaves meaningful amount)
export const RECOMMENDED_MINIMUM_USD: Record<string, number> = {
  ethereum: 25.00,    // Covers gas + leaves ~$15-20
  bsc: 2.00,          // Covers gas + leaves ~$1.90
  solana: 1.00,       // Covers gas + leaves ~$0.99
  bitcoin: 50.00,     // Covers fee + leaves ~$40
};

// Quota/limit defaults for agents
export const DEFAULT_QUOTAS = {
  // Per-transaction limits
  max_transaction_usd: 10000,
  
  // Daily limits
  max_daily_transactions: 100,
  max_daily_volume_usd: 50000,
  
  // Monthly limits
  max_monthly_transactions: 1000,
  max_monthly_volume_usd: 500000,
  
  // Cooldown between transactions (seconds)
  min_transaction_interval: 5,
} as const;

// Price feeds (in production, fetch from oracle)
export const TOKEN_PRICES_USD: Record<string, number> = {
  ETH: 2500,
  BNB: 300,
  SOL: 200,
  BTC: 50000,
  USDT: 1,
  USDC: 1,
};

// ============================================
// TREASURY / FEE COLLECTION CONFIGURATION
// ============================================

// Bank-owned treasury wallets to receive collected fees
// These should be set in environment variables in production
export const TREASURY_WALLETS: Record<string, string> = {
  ethereum: process.env.TREASURY_ETH_ADDRESS || '0x0000000000000000000000000000000000000000',
  bsc: process.env.TREASURY_BSC_ADDRESS || '0x0000000000000000000000000000000000000000',
  solana: process.env.TREASURY_SOL_ADDRESS || '11111111111111111111111111111111',
  bitcoin: process.env.TREASURY_BTC_ADDRESS || 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
};

// Minimum accumulated fees (in USD) before sweeping to treasury
// Prevents wasting gas on small fee collections
export const FEE_SWEEP_THRESHOLDS: Record<string, number> = {
  ethereum: 50.00,   // Sweep when >= $50 accumulated (ETH gas is expensive)
  bsc: 5.00,         // Sweep when >= $5 accumulated (BSC is cheap)
  solana: 1.00,      // Sweep when >= $1 accumulated (SOL is very cheap)
  bitcoin: 100.00,   // Sweep when >= $100 accumulated (BTC fees vary)
};

// Maximum time (hours) before forcing a fee sweep regardless of threshold
// Ensures fees don't sit uncollected indefinitely
export const FEE_SWEEP_MAX_AGE_HOURS = 168; // 7 days

// Minimum individual fee to record (below this, absorb as operational cost)
export const MIN_RECORDABLE_FEE_USD = 0.001; // $0.001

export type TransactionType = 'transfer' | 'swap' | 'stake' | 'unstake' | 'withdraw' | 'deposit';
