import { and, eq } from 'drizzle-orm';
import { AppError } from '@splitbook/shared';
import { groups, memberships } from '../db/schema.js';

/**
 * For routes under /groups/:groupId — the caller must be an ACTIVE member,
 * otherwise 404 so group existence never leaks (NFR-06, FR-GRP-15).
 * Sets `req.group` and `req.membership`. Use after `requireAuth`.
 */
export function requireMember(ctx) {
  return (req, res, next) => {
    const groupId = Number(req.params.groupId);
    if (!Number.isSafeInteger(groupId) || groupId <= 0) return next(new AppError('NOT_FOUND'));

    const row = ctx.db
      .select({ group: groups, membership: memberships })
      .from(memberships)
      .innerJoin(groups, eq(groups.id, memberships.groupId))
      .where(
        and(
          eq(memberships.groupId, groupId),
          eq(memberships.userId, req.user.id),
          eq(memberships.status, 'active'),
        ),
      )
      .get();
    if (!row) return next(new AppError('NOT_FOUND'));

    req.group = row.group;
    req.membership = row.membership;
    next();
  };
}

/** Admin-only action inside a group (403 for other members). Use after `requireMember`. */
export function requireAdmin(req, res, next) {
  next(req.membership.role === 'admin' ? undefined : new AppError('FORBIDDEN'));
}
