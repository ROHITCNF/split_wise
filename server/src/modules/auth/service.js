import { and, eq } from 'drizzle-orm';
import { AppError } from '@splitbook/shared';
import { loginMethods, users } from '../../db/schema.js';
import { hashPassword, verifyPassword } from '../../lib/passwords.js';
import { nowIso } from '../../lib/time.js';
import { withTransaction } from '../../lib/transaction.js';
import { findActiveUserByEmail, loginMethodsOf, passwordMethodOf } from '../users/repository.js';

/**
 * A1 — creates a verified account straight away (no email verification for the
 * MVP, REQUIREMENTS v1.3). Any existing account on the email → EMAIL_ALREADY_REGISTERED,
 * including Google-only accounts: without verification we can't prove the email
 * belongs to the caller, so we never attach a password to someone else's account.
 * @returns {Promise<number>} the new user's ID
 */
export async function signup(ctx, { name, email, password }) {
  const passwordHash = await hashPassword(password);
  return withTransaction(ctx, () => {
    if (findActiveUserByEmail(ctx, email)) throw new AppError('EMAIL_ALREADY_REGISTERED');
    const now = nowIso();
    const userId = Number(
      ctx.db
        .insert(users)
        .values({ name, email, emailVerifiedAt: now, createdAt: now, updatedAt: now })
        .run().lastInsertRowid,
    );
    ctx.db
      .insert(loginMethods)
      .values({ userId, type: 'password', passwordHash, createdAt: now })
      .run();
    return userId;
  });
}

/**
 * A4 — returns the user ID. Wrong email and wrong password give the same error
 * (and similar timing).
 */
export async function login(ctx, { email, password }) {
  const user = findActiveUserByEmail(ctx, email);
  const passwordMethod = user ? passwordMethodOf(ctx, user.id) : undefined;
  const ok = await verifyPassword(passwordMethod?.passwordHash, password);
  if (!ok) throw new AppError('INVALID_CREDENTIALS');
  return user.id;
}

/**
 * A6 — signs in with a provider identity (FR-AUTH-02/04):
 * known Google subject → that user; same email → link Google; else new user.
 * @param {{ subject: string, email: string, name: string }} identity
 * @returns {number} user ID
 */
export function googleSignIn(ctx, identity) {
  const email = identity.email.trim().toLowerCase();
  return withTransaction(ctx, () => {
    const now = nowIso();
    const linked = ctx.db
      .select({ user: users })
      .from(loginMethods)
      .innerJoin(users, eq(users.id, loginMethods.userId))
      .where(
        and(eq(loginMethods.type, 'google'), eq(loginMethods.providerSubject, identity.subject)),
      )
      .get();
    if (linked?.user.status === 'active') return linked.user.id;

    const existing = findActiveUserByEmail(ctx, email);
    if (existing) {
      if (!loginMethodsOf(ctx, existing.id).some((m) => m.type === 'google')) {
        ctx.db
          .insert(loginMethods)
          .values({
            userId: existing.id,
            type: 'google',
            providerSubject: identity.subject,
            createdAt: now,
          })
          .run();
      }
      return existing.id;
    }

    const userId = Number(
      ctx.db
        .insert(users)
        .values({
          name: identity.name.slice(0, 60) || email,
          email,
          emailVerifiedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .run().lastInsertRowid,
    );
    ctx.db
      .insert(loginMethods)
      .values({ userId, type: 'google', providerSubject: identity.subject, createdAt: now })
      .run();
    return userId;
  });
}
