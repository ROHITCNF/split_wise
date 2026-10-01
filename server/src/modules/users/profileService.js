import { and, eq } from 'drizzle-orm';
import { AppError } from '@splitbook/shared';
import { loginMethods, memberships, sessions, users } from '../../db/schema.js';
import { hashPassword, verifyPassword } from '../../lib/passwords.js';
import { nowIso } from '../../lib/time.js';
import { withTransaction } from '../../lib/transaction.js';
import { nonZeroBalancesForUser } from '../balances/service.js';
import { recordActivity } from '../history/writers.js';
import { passwordMethodOf } from './repository.js';

/** P1 */
export function updateName(ctx, userId, name) {
  ctx.db.update(users).set({ name, updatedAt: nowIso() }).where(eq(users.id, userId)).run();
}

/** P2 — other sessions stay logged in (logout-all is out of scope). */
export async function changePassword(ctx, userId, { currentPassword, newPassword }) {
  const method = passwordMethodOf(ctx, userId);
  if (!method) throw new AppError('NO_PASSWORD_METHOD');
  if (!(await verifyPassword(method.passwordHash, currentPassword))) {
    throw new AppError('WRONG_PASSWORD', {
      fieldErrors: { currentPassword: 'Current password is incorrect' },
    });
  }
  const passwordHash = await hashPassword(newPassword);
  ctx.db.update(loginMethods).set({ passwordHash }).where(eq(loginMethods.id, method.id)).run();
}

/**
 * P3 — FR-AUTH-08. Blocked while any balance is non-zero, and while the user is
 * admin of a group (the group would be left without an admin; they must use the
 * admin-leave flow first). Otherwise the account is tombstoned (S-6): email freed,
 * name kept for history, memberships → left, sessions and credentials removed.
 */
export function deleteAccount(ctx, user) {
  withTransaction(ctx, () => {
    const balances = nonZeroBalancesForUser(ctx, user.id);
    if (balances.length > 0) {
      throw new AppError('BALANCE_NOT_ZERO', {
        message: 'Settle all balances before deleting your account.',
        details: { groups: balances },
      });
    }

    const active = ctx.sqlite
      .prepare(
        `SELECT m.id, m.group_id AS groupId, m.role, g.name AS groupName
         FROM memberships m JOIN groups g ON g.id = m.group_id
         WHERE m.user_id = ? AND m.status = 'active'`,
      )
      .all(user.id);
    const adminOf = active.filter((m) => m.role === 'admin');
    if (adminOf.length > 0) {
      throw new AppError('ADMIN_MUST_CHOOSE', {
        message: 'You are admin of a group. Leave it (make someone else admin or delete it) first.',
        details: { groups: adminOf.map(({ groupId, groupName }) => ({ groupId, groupName })) },
      });
    }

    const now = nowIso();
    for (const m of active) {
      ctx.db
        .update(memberships)
        .set({ status: 'left', endedAt: now })
        .where(and(eq(memberships.id, m.id), eq(memberships.status, 'active')))
        .run();
      recordActivity(ctx, {
        groupId: m.groupId,
        actorMembershipId: m.id,
        type: 'member_left',
        subjectType: 'membership',
        subjectId: m.id,
        summary: `${user.name} left the group (account deleted)`,
      });
    }

    ctx.db.delete(sessions).where(eq(sessions.userId, user.id)).run();
    ctx.db.delete(loginMethods).where(eq(loginMethods.userId, user.id)).run();
    ctx.db
      .update(users)
      .set({
        email: `deleted+${user.id}@invalid`,
        status: 'deleted',
        deletedAt: now,
        updatedAt: now,
      })
      .where(eq(users.id, user.id))
      .run();
  });
}
