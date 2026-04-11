import rateLimit from 'express-rate-limit';

export function createRateLimit(maxPerMinute: number) {
  return rateLimit({
    windowMs: 60 * 1000,
    max: maxPerMinute,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { message: 'Too many requests', code: 'RATE_LIMITED' } },
  });
}
