import rateLimit from 'express-rate-limit';
import { Request } from 'express';

// General API rate limiter (1000 req/15 min)
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: 'Too many requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'development',
});

// Auth rate limiter (100 attempts/15 min per IP)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many login attempts, please try again later',
  skipSuccessfulRequests: true,
  legacyHeaders: false,
});

// Transaction rate limiter (100 txs/min per agent)
export const transactionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  keyGenerator: (req: Request) => {
    return (req as any).agent?.sub || req.ip || 'unknown';
  },
  message: 'Too many transactions, please slow down',
  legacyHeaders: false,
});

// Strict limiter for sensitive operations (50 attempts/hour per IP)
export const strictLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 50,
  message: 'Too many attempts, please try again later',
  legacyHeaders: false,
});
