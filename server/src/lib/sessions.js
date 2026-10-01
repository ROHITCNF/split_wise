import { and, eq, gt } from 'drizzle-orm';
import { sessions, users } from '../db/schema.js';
import { randomToken, sha256 } from './crypto.js';
import { nowIso } from './time.js';

export const SESSION_COOKIE = 'sid';
const DAY_MS = 24 * 60 * 60 * 1000;
const TOUCH_INTERVAL_MS = 60 * 1000;

function cookieOptions(config) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    path: '/',
    maxAge: config.sessionTtlDays * DAY_MS,
  };
}

/**
 * Creates a session row for a logged-in device and sets the `sid` cookie (ADR-005).
 * Only the SHA-256 of the token is stored.
 */
export function startSession(ctx, res, { userId, userAgent }) {
  const token = randomToken();
  const now = new Date();
  ctx.db
    .insert(sessions)
    .values({
      id: sha256(token),
      userId,
      userAgent: userAgent?.slice(0, 255) ?? null,
      createdAt: now.toISOString(),
      lastSeenAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ctx.config.sessionTtlDays * DAY_MS).toISOString(),
    })
    .run();
  res.cookie(SESSION_COOKIE, token, cookieOptions(ctx.config));
}

/** Logs out the current device only (FR-AUTH-05). */
export function endSession(ctx, res, sessionId) {
  if (sessionId) ctx.db.delete(sessions).where(eq(sessions.id, sessionId)).run();
  res.clearCookie(SESSION_COOKIE, { ...cookieOptions(ctx.config), maxAge: undefined });
}

/**
 * Resolves a cookie token to `{ session, user }`, or null when missing, expired
 * or the account is no longer active. Extends the expiry (sliding window, S-4)
 * at most once a minute to keep writes low.
 */
export function resolveSession(ctx, token) {
  if (!token) return null;
  const id = sha256(token);
  const now = new Date();

  const row = ctx.db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, now.toISOString())))
    .get();
  if (!row || row.user.status !== 'active') return null;

  if (now.getTime() - Date.parse(row.session.lastSeenAt) > TOUCH_INTERVAL_MS) {
    ctx.db
      .update(sessions)
      .set({
        lastSeenAt: nowIso(),
        expiresAt: new Date(now.getTime() + ctx.config.sessionTtlDays * DAY_MS).toISOString(),
      })
      .where(eq(sessions.id, id))
      .run();
  }
  return row;
}
