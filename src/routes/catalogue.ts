import express, { Request, Response } from 'express';
import { SUPPORTED_CHAINS, TOKEN_CONTRACTS, TOKEN_DECIMALS, MINIMUM_TRANSACTION_USD, RECOMMENDED_MINIMUM_USD } from '../constants.js';
import { HTTP_STATUS } from '../constants.js';
import { PriceOracle } from '../services/priceOracle.js';

export const catalogueRouter = express.Router();

/**
 * GET /api/catalogue/chains
 * Get list of supported blockchain networks
 */
catalogueRouter.get('/chains', (_req: Request, res: Response) => {
  res.status(HTTP_STATUS.OK).json({
    chains: SUPPORTED_CHAINS.map((chain) => ({
      id: chain.id,
      name: chain.name,
      symbol: chain.symbol,
      native_token: chain.nativeToken,
      decimals: chain.decimals,
      chain_id: chain.chainId,
      explorer: chain.explorer,
      tokens: chain.tokens,
    })),
  });
});

/**
 * GET /api/catalogue/tokens
 * Get list of supported tokens with contract addresses
 */
catalogueRouter.get('/tokens', (_req: Request, res: Response) => {
  const tokens: Array<{
    symbol: string;
    decimals: number;
    contracts: Record<string, string>;
  }> = [];

  // Build token list from contracts
  const allTokens = new Set<string>();
  for (const chain of Object.keys(TOKEN_CONTRACTS)) {
    for (const token of Object.keys(TOKEN_CONTRACTS[chain])) {
      allTokens.add(token);
    }
  }

  for (const symbol of allTokens) {
    const contracts: Record<string, string> = {};
    for (const chain of Object.keys(TOKEN_CONTRACTS)) {
      if (TOKEN_CONTRACTS[chain][symbol]) {
        contracts[chain] = TOKEN_CONTRACTS[chain][symbol];
      }
    }
    tokens.push({
      symbol,
      decimals: TOKEN_DECIMALS[symbol] || 18,
      contracts,
    });
  }

  res.status(HTTP_STATUS.OK).json({ tokens });
});

/**
 * GET /api/catalogue/chains/:chainId
 * Get details for a specific chain
 */
catalogueRouter.get('/chains/:chainId', (req: Request, res: Response) => {
  const chain = SUPPORTED_CHAINS.find((c) => c.id === req.params.chainId);

  if (!chain) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      error: `Chain not found: ${req.params.chainId}`,
      supported_chains: SUPPORTED_CHAINS.map((c) => c.id),
    });
  }

  res.status(HTTP_STATUS.OK).json({
    id: chain.id,
    name: chain.name,
    symbol: chain.symbol,
    native_token: chain.nativeToken,
    decimals: chain.decimals,
    chain_id: chain.chainId,
    explorer: chain.explorer,
    tokens: chain.tokens,
    contracts: TOKEN_CONTRACTS[chain.id] || {},
  });
});

/**
 * GET /api/catalogue/prices
 * Get current token prices
 */
catalogueRouter.get('/prices', async (_req: Request, res: Response) => {
  try {
    const priceData = await PriceOracle.getAllPrices();
    res.status(HTTP_STATUS.OK).json(priceData);
  } catch (error: any) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({ error: error.message });
  }
});

/**
 * GET /api/catalogue/minimums
 * Get minimum transaction amounts per chain
 */
catalogueRouter.get('/minimums', (_req: Request, res: Response) => {
  const minimums: Record<string, { minimum_usd: number; recommended_usd: number }> = {};
  
  for (const chain of Object.keys(MINIMUM_TRANSACTION_USD)) {
    minimums[chain] = {
      minimum_usd: MINIMUM_TRANSACTION_USD[chain],
      recommended_usd: RECOMMENDED_MINIMUM_USD[chain] || MINIMUM_TRANSACTION_USD[chain] * 2,
    };
  }
  
  res.status(HTTP_STATUS.OK).json({
    minimums,
    note: 'Transactions below minimum will be rejected due to gas costs',
  });
});

/**
 * GET /api/catalogue/tokens/:symbol
 * Get details for a specific token
 */
catalogueRouter.get('/tokens/:symbol', (req: Request, res: Response) => {
  const symbol = req.params.symbol.toUpperCase();

  if (!TOKEN_DECIMALS[symbol]) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      error: `Token not found: ${symbol}`,
      supported_tokens: Object.keys(TOKEN_DECIMALS),
    });
  }

  const contracts: Record<string, string> = {};
  for (const chain of Object.keys(TOKEN_CONTRACTS)) {
    if (TOKEN_CONTRACTS[chain][symbol]) {
      contracts[chain] = TOKEN_CONTRACTS[chain][symbol];
    }
  }

  res.status(HTTP_STATUS.OK).json({
    symbol,
    decimals: TOKEN_DECIMALS[symbol],
    contracts,
    supported_chains: Object.keys(contracts),
  });
});
