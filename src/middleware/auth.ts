import { Request, Response, NextFunction } from 'express';
import { AuthService, type AuthTokenPayload } from '../services/auth.js';
import { HTTP_STATUS } from '../constants.js';

declare global {
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
      agent?: AuthTokenPayload;
    }
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  const apiKey = req.headers['x-api-key'];

  // Try JWT Bearer token first
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      const payload = AuthService.verifyToken(token);
      if (payload.type === 'human') {
        req.user = payload;
      } else if (payload.type === 'agent') {
        req.agent = payload;
      }
      next();
      return;
    } catch (error) {
      res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: 'Invalid token' });
      return;
    }
  }

  // Try API Key (X-API-Key header)
  if (apiKey && typeof apiKey === 'string') {
    try {
      const payload = await AuthService.verifyApiKey(apiKey);
      if (payload.type === 'human') {
        req.user = payload;
      } else if (payload.type === 'agent') {
        req.agent = payload;
      }
      next();
      return;
    } catch (error) {
      res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: 'Invalid API key' });
      return;
    }
  }

  res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: 'Missing authorization token or API key' });
}

export function requireHuman(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(HTTP_STATUS.FORBIDDEN).json({ error: 'Human authentication required' });
    return;
  }
  next();
}

export function requireAgent(req: Request, res: Response, next: NextFunction): void {
  if (!req.agent) {
    res.status(HTTP_STATUS.FORBIDDEN).json({ error: 'Agent authentication required' });
    return;
  }
  next();
}

export function apiKeyMiddleware(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'] as string;

  if (!apiKey) {
    res.status(HTTP_STATUS.UNAUTHORIZED).json({ error: 'Missing API key' });
    return;
  }

  req.headers['x-api-key'] = apiKey;
  next();
}
