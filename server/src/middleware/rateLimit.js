import { rateLimit } from 'express-rate-limit';
import { AppError } from '@splitbook/shared';

/**
 * Brute-force protection for auth endpoints: `limit` requests per minute per IP
 * (API_CONTRACT §1). Exceeding it returns 429 RATE_LIMITED with retryAfterSeconds.
 */
export function authRateLimit({ limit = 10, windowMs = 60_000 } = {}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res, next, options) => {
      const resetTime = req.rateLimit?.resetTime;
      const retryAfterSeconds = resetTime
        ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
        : Math.ceil(options.windowMs / 1000);
      next(new AppError('RATE_LIMITED', { details: { retryAfterSeconds } }));
    },
  });
}
