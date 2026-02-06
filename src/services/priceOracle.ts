import { logger } from '../utils/logger.js';
import { TOKEN_PRICES_USD } from '../constants.js';

// Cache for prices (5 minute TTL)
interface PriceCache {
  prices: Record<string, number>;
  timestamp: number;
}

let priceCache: PriceCache = {
  prices: { ...TOKEN_PRICES_USD },
  timestamp: 0,
};

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const COINGECKO_API = 'https://api.coingecko.com/api/v3';

// CoinGecko token IDs
const TOKEN_IDS: Record<string, string> = {
  ETH: 'ethereum',
  BNB: 'binancecoin',
  SOL: 'solana',
  BTC: 'bitcoin',
  USDT: 'tether',
  USDC: 'usd-coin',
};

export class PriceOracle {
  /**
   * Fetch live prices from CoinGecko
   */
  static async fetchPrices(): Promise<Record<string, number>> {
    try {
      const ids = Object.values(TOKEN_IDS).join(',');
      const response = await fetch(
        `${COINGECKO_API}/simple/price?ids=${ids}&vs_currencies=usd`
      );

      if (!response.ok) {
        throw new Error(`CoinGecko API error: ${response.status}`);
      }

      const data = await response.json() as Record<string, { usd?: number }>;
      const prices: Record<string, number> = {};

      // Map CoinGecko IDs back to token symbols
      for (const [symbol, id] of Object.entries(TOKEN_IDS)) {
        if (data[id]?.usd) {
          prices[symbol] = data[id].usd;
        }
      }

      logger.info(`Fetched live prices: ${JSON.stringify(prices)}`);
      return prices;
    } catch (error) {
      logger.error('Failed to fetch prices from CoinGecko:', error);
      throw error;
    }
  }

  /**
   * Get cached prices or fetch fresh ones
   */
  static async getPrices(): Promise<Record<string, number>> {
    const now = Date.now();

    // Return cached prices if still valid
    if (now - priceCache.timestamp < CACHE_TTL_MS) {
      return priceCache.prices;
    }

    // Try to fetch fresh prices
    try {
      const freshPrices = await this.fetchPrices();
      priceCache = {
        prices: { ...TOKEN_PRICES_USD, ...freshPrices },
        timestamp: now,
      };
      return priceCache.prices;
    } catch (error) {
      // Fall back to cached/static prices on error
      logger.warn('Using cached/static prices due to fetch error');
      return priceCache.prices;
    }
  }

  /**
   * Get price for a specific token
   */
  static async getPrice(token: string): Promise<number> {
    const prices = await this.getPrices();
    return prices[token.toUpperCase()] || 1;
  }

  /**
   * Convert amount to USD
   */
  static async toUSD(amount: string, token: string): Promise<number> {
    const price = await this.getPrice(token);
    return parseFloat(amount) * price;
  }

  /**
   * Convert USD to token amount
   */
  static async fromUSD(usdAmount: number, token: string): Promise<string> {
    const price = await this.getPrice(token);
    return (usdAmount / price).toString();
  }

  /**
   * Get all current prices
   */
  static async getAllPrices(): Promise<{
    prices: Record<string, number>;
    last_updated: string;
    source: string;
  }> {
    const prices = await this.getPrices();
    return {
      prices,
      last_updated: new Date(priceCache.timestamp).toISOString(),
      source: priceCache.timestamp > 0 ? 'coingecko' : 'static',
    };
  }

  /**
   * Force refresh prices
   */
  static async refreshPrices(): Promise<Record<string, number>> {
    priceCache.timestamp = 0; // Invalidate cache
    return this.getPrices();
  }
}
