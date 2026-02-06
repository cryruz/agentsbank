import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError, ZodIssue } from 'zod';
import { HTTP_STATUS } from '../constants.js';
import { logger } from '../utils/logger.js';

export function validateRequest(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const validated = schema.parse(req.body);
      req.body = validated;
      next();
    } catch (error: unknown) {
      if (error instanceof ZodError) {
        const zodError = error as ZodError;
        const formattedErrors = zodError.errors.map((err: ZodIssue) => ({
          field: err.path.join('.'),
          message: err.message,
        }));

        logger.warn('Validation error:', { errors: formattedErrors });

        res.status(HTTP_STATUS.BAD_REQUEST).json({
          error: 'Validation failed',
          details: formattedErrors,
        });
        return;
      }

      logger.error('Unknown validation error:', error);
      res.status(HTTP_STATUS.INTERNAL_ERROR).json({ error: 'Validation error' });
    }
  };
}

export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const validated = schema.parse(req.query);
      req.query = validated as typeof req.query;
      next();
    } catch (error: unknown) {
      if (error instanceof ZodError) {
        const zodError = error as ZodError;
        const formattedErrors = zodError.errors.map((err: ZodIssue) => ({
          field: err.path.join('.'),
          message: err.message,
        }));

        res.status(HTTP_STATUS.BAD_REQUEST).json({
          error: 'Query validation failed',
          details: formattedErrors,
        });
        return;
      }

      res.status(HTTP_STATUS.INTERNAL_ERROR).json({ error: 'Validation error' });
    }
  };
}
