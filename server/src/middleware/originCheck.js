import { AppError } from '@splitbook/shared';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence (ADR-005): state-changing requests must come from our own origin.
 * Browsers always send Origin on cross-site POST/PUT/PATCH/DELETE; we also reject
 * requests without it.
 */
export function originCheck(appOrigin) {
  return (req, res, next) => {
    if (SAFE_METHODS.has(req.method) || req.get('origin') === appOrigin) return next();
    next(new AppError('FORBIDDEN', { message: 'Request origin not allowed.' }));
  };
}
