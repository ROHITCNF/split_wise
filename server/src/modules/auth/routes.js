import { Router } from 'express';
import { parse as parseCookies } from 'cookie';
import { loginBody, signupBody } from '@splitbook/shared';
import { authRateLimit } from '../../middleware/rateLimit.js';
import { requireAuth } from '../../middleware/session.js';
import { validate } from '../../middleware/validate.js';
import { randomToken } from '../../lib/crypto.js';
import { endSession, startSession } from '../../lib/sessions.js';
import { findUserById, toUserDto } from '../users/repository.js';
import { googleSignIn, login, signup } from './service.js';

const STATE_COOKIE = 'g_state';
const CALLBACK_PATH = '/api/auth/google/callback';

/** A1, A4–A8 (API_CONTRACT §3). */
export function authRoutes(ctx) {
  const router = Router();
  const limited = authRateLimit({ limit: ctx.config.authRateLimitPerMinute });

  const logIn = (req, res, userId) => {
    startSession(ctx, res, { userId, userAgent: req.get('user-agent') });
    return { user: toUserDto(ctx, findUserById(ctx, userId)) };
  };

  // A1 — account is verified immediately and the user is logged in (REQUIREMENTS v1.3).
  router.post('/signup', limited, validate({ body: signupBody }), async (req, res) => {
    const userId = await signup(ctx, req.valid.body);
    res.status(201).json(logIn(req, res, userId));
  });

  router.post('/login', limited, validate({ body: loginBody }), async (req, res) => {
    const userId = await login(ctx, req.valid.body);
    res.json(logIn(req, res, userId));
  });

  // A5 — full-page navigation, not fetch.
  router.get('/google/start', (req, res) => {
    const state = randomToken(16);
    res.cookie(STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: ctx.config.cookieSecure,
      path: '/api/auth/google',
      maxAge: 10 * 60 * 1000,
    });
    res.redirect(302, ctx.identityProvider.authorizeUrl({ state, redirectUri: CALLBACK_PATH }));
  });

  // A6
  router.get('/google/callback', async (req, res) => {
    const expected = parseCookies(req.headers.cookie ?? '')[STATE_COOKIE];
    res.clearCookie(STATE_COOKIE, { path: '/api/auth/google' });
    try {
      if (!expected || req.query.state !== expected) throw new Error('OAuth state mismatch');
      const identity = await ctx.identityProvider.complete({ code: String(req.query.code ?? '') });
      logIn(req, res, googleSignIn(ctx, identity));
      res.redirect(302, `${ctx.config.appOrigin}/`);
    } catch (err) {
      req.log?.warn({ err }, 'google sign-in failed');
      res.redirect(302, `${ctx.config.appOrigin}/login?error=google_failed`);
    }
  });

  // A7 — current device only.
  router.post('/logout', (req, res) => {
    endSession(ctx, res, req.sessionId);
    res.status(204).end();
  });

  // A8
  router.get('/me', requireAuth, (req, res) => {
    res.json({ user: toUserDto(ctx, req.user) });
  });

  return router;
}
