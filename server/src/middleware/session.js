import { parse as parseCookies } from 'cookie';
import { AppError } from '@splitbook/shared';
import { resolveSession, SESSION_COOKIE } from '../lib/sessions.js';

/** Attaches `req.user` and `req.sessionId` when the `sid` cookie is valid. */
export function loadSession(ctx) {
  return (req, res, next) => {
    const token = parseCookies(req.headers.cookie ?? '')[SESSION_COOKIE];
    const resolved = resolveSession(ctx, token);
    if (resolved) {
      req.user = resolved.user;
      req.sessionId = resolved.session.id;
    }
    next();
  };
}

/** Rejects requests without a valid session with 401 UNAUTHENTICATED. */
export function requireAuth(req, res, next) {
  next(req.user ? undefined : new AppError('UNAUTHENTICATED'));
}
