import { and, eq, isNull } from 'drizzle-orm';
import { AppError } from '@splitbook/shared';
import { emailVerificationTokens, loginMethods, users } from '../../db/schema.js';
import { randomToken, sha256 } from '../../lib/crypto.js';
import { hashPassword, verifyPassword } from '../../lib/passwords.js';
import { nowIso } from '../../lib/time.js';
import { withTransaction } from '../../lib/transaction.js';
import { findActiveUserByEmail, loginMethodsOf, passwordMethodOf } from '../users/repository.js';

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // S-5

/** Creates a single-use verification token; only its hash is stored. Returns the raw token. */
function issueToken(ctx, { userId, purpose, pendingPasswordHash = null }) {
  const token = randomToken();
  const now = new Date();
  ctx.db
    .update(emailVerificationTokens)
    .set({ usedAt: now.toISOString() })
    .where(
      and(
        eq(emailVerificationTokens.userId, userId),
        eq(emailVerificationTokens.purpose, purpose),
        isNull(emailVerificationTokens.usedAt),
      ),
    )
    .run();
  ctx.db
    .insert(emailVerificationTokens)
    .values({
      userId,
      tokenHash: sha256(token),
      purpose,
      pendingPasswordHash,
      expiresAt: new Date(now.getTime() + TOKEN_TTL_MS).toISOString(),
      createdAt: now.toISOString(),
    })
    .run();
  return token;
}

/** Sent after the transaction commits, so a rolled-back signup never emails a link. */
function sendVerification(ctx, { email, purpose, token }) {
  ctx.mailer.send({
    to: email,
    purpose,
    link: `${ctx.config.appOrigin}/verify?token=${encodeURIComponent(token)}`,
  });
}

/**
 * A1 — the four signup cases from API_CONTRACT §3. Throws EMAIL_ALREADY_REGISTERED
 * only for a verified account that already has a password.
 */
export async function signup(ctx, { name, email, password }) {
  const passwordHash = await hashPassword(password);

  const mail = withTransaction(ctx, () => {
    const now = nowIso();
    const existing = findActiveUserByEmail(ctx, email);

    if (!existing) {
      const userId = Number(
        ctx.db.insert(users).values({ name, email, createdAt: now, updatedAt: now }).run()
          .lastInsertRowid,
      );
      ctx.db
        .insert(loginMethods)
        .values({ userId, type: 'password', passwordHash, createdAt: now })
        .run();
      return {
        purpose: 'verify_email',
        token: issueToken(ctx, { userId, purpose: 'verify_email' }),
      };
    }

    const passwordMethod = passwordMethodOf(ctx, existing.id);
    if (passwordMethod && existing.emailVerifiedAt) throw new AppError('EMAIL_ALREADY_REGISTERED');

    if (passwordMethod) {
      // Unverified signup retried: latest password and name win.
      ctx.db
        .update(loginMethods)
        .set({ passwordHash })
        .where(eq(loginMethods.id, passwordMethod.id))
        .run();
      ctx.db.update(users).set({ name, updatedAt: now }).where(eq(users.id, existing.id)).run();
      return {
        purpose: 'verify_email',
        token: issueToken(ctx, { userId: existing.id, purpose: 'verify_email' }),
      };
    }

    // Google-only account: the password is attached only after the email link is used (DF-3).
    return {
      purpose: 'link_password',
      token: issueToken(ctx, {
        userId: existing.id,
        purpose: 'link_password',
        pendingPasswordHash: passwordHash,
      }),
    };
  });

  sendVerification(ctx, { email, ...mail });
}

/** A2 — uses a token; returns the user ID to log in. */
export function verifyEmail(ctx, token) {
  return withTransaction(ctx, () => {
    const now = nowIso();
    const row = ctx.db
      .select()
      .from(emailVerificationTokens)
      .where(eq(emailVerificationTokens.tokenHash, sha256(token)))
      .get();
    if (!row || row.usedAt || row.expiresAt <= now) throw new AppError('TOKEN_INVALID_OR_EXPIRED');

    const user = ctx.db.select().from(users).where(eq(users.id, row.userId)).get();
    if (!user || user.status !== 'active') throw new AppError('TOKEN_INVALID_OR_EXPIRED');

    if (row.purpose === 'link_password') {
      const existing = passwordMethodOf(ctx, user.id);
      if (existing) {
        ctx.db
          .update(loginMethods)
          .set({ passwordHash: row.pendingPasswordHash })
          .where(eq(loginMethods.id, existing.id))
          .run();
      } else {
        ctx.db
          .insert(loginMethods)
          .values({
            userId: user.id,
            type: 'password',
            passwordHash: row.pendingPasswordHash,
            createdAt: now,
          })
          .run();
      }
    }
    if (!user.emailVerifiedAt) {
      ctx.db
        .update(users)
        .set({ emailVerifiedAt: now, updatedAt: now })
        .where(eq(users.id, user.id))
        .run();
    }
    ctx.db
      .update(emailVerificationTokens)
      .set({ usedAt: now })
      .where(eq(emailVerificationTokens.id, row.id))
      .run();
    return user.id;
  });
}

/** A3 — never reveals whether the email exists. */
export function resendVerification(ctx, email) {
  const token = withTransaction(ctx, () => {
    const user = findActiveUserByEmail(ctx, email);
    if (!user || user.emailVerifiedAt || !passwordMethodOf(ctx, user.id)) return null;
    return issueToken(ctx, { userId: user.id, purpose: 'verify_email' });
  });
  if (token) sendVerification(ctx, { email, purpose: 'verify_email', token });
}

/**
 * A4 — returns the user ID. Wrong email and wrong password give the same error;
 * "not verified" is only revealed once the password is correct.
 */
export async function login(ctx, { email, password }) {
  const user = findActiveUserByEmail(ctx, email);
  const passwordMethod = user ? passwordMethodOf(ctx, user.id) : undefined;
  const ok = await verifyPassword(passwordMethod?.passwordHash, password);
  if (!ok) throw new AppError('INVALID_CREDENTIALS');
  if (!user.emailVerifiedAt) throw new AppError('EMAIL_NOT_VERIFIED');
  return user.id;
}

/**
 * A6 — signs in with a verified provider identity (FR-AUTH-02/04):
 * known Google subject → that user; same email → link Google; else new verified user.
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
      if (!existing.emailVerifiedAt) {
        // Google has verified this email, so a pending password signup becomes verified too.
        ctx.db
          .update(users)
          .set({ emailVerifiedAt: now, updatedAt: now })
          .where(eq(users.id, existing.id))
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
