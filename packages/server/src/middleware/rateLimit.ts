import type { RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';

export function createRateLimit(maxPerMinute: number): RequestHandler {
  if (
    process.env['E2E_DISABLE_RATE_LIMIT'] === '1' ||
    process.env['NODE_ENV'] === 'test'
  ) {
    return (_req, _res, next) => next();
  }

  return rateLimit({
    windowMs: 60 * 1000,
    max: maxPerMinute,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { message: 'Too many requests', code: 'RATE_LIMITED' } },
  }) as RequestHandler;
}
