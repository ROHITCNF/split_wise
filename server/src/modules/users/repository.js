import { and, eq } from 'drizzle-orm';
import { loginMethods, users } from '../../db/schema.js';

/** Active user by email (emails are stored lower-case). */
export function findActiveUserByEmail(ctx, email) {
  return ctx.db
    .select()
    .from(users)
    .where(and(eq(users.email, email), eq(users.status, 'active')))
    .get();
}

export function findUserById(ctx, id) {
  return ctx.db.select().from(users).where(eq(users.id, id)).get();
}

/** @returns {{ id: number, type: 'password'|'google', passwordHash: string|null }[]} */
export function loginMethodsOf(ctx, userId) {
  return ctx.db.select().from(loginMethods).where(eq(loginMethods.userId, userId)).all();
}

export function passwordMethodOf(ctx, userId) {
  return loginMethodsOf(ctx, userId).find((m) => m.type === 'password');
}

/** User object returned by the API (API_CONTRACT §1.4). */
export function toUserDto(ctx, user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerifiedAt !== null,
    loginMethods: loginMethodsOf(ctx, user.id)
      .map((m) => m.type)
      .sort((a, b) => (a === 'password' ? -1 : b === 'password' ? 1 : 0)),
    createdAt: user.createdAt,
  };
}
