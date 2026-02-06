import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';
import { HTTP_STATUS } from '../constants.js';

export interface ApiError extends Error {
  statusCode?: number;
}

export function errorHandler(err: ApiError, req: Request, res: Response, _next: NextFunction) {
  const statusCode = err.statusCode || HTTP_STATUS.INTERNAL_ERROR;
  const message = err.message || 'Internal server error';

  logger.error({
    error: message,
    statusCode,
    path: req.path,
    method: req.method,
  });

  res.status(statusCode).json({
    error: message,
    timestamp: new Date().toISOString(),
  });
}
