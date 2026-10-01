// SQL for groups and memberships (ADR-009: only repositories touch SQL).

/** All memberships of a group (active and past), with user names, oldest first. */
export function membershipsOfGroup(ctx, groupId) {
  return ctx.sqlite
    .prepare(
      `SELECT m.id AS membershipId, m.user_id AS userId, u.name, u.email, m.role, m.status,
              m.joined_at AS joinedAt, m.ended_at AS endedAt
       FROM memberships m JOIN users u ON u.id = m.user_id
       WHERE m.group_id = ?
       ORDER BY m.id`,
    )
    .all(groupId);
}

export function activeMembership(ctx, groupId, membershipId) {
  return ctx.sqlite
    .prepare(
      `SELECT id, group_id AS groupId, user_id AS userId, role, status FROM memberships WHERE id = ? AND group_id = ? AND status = 'active'`,
    )
    .get(membershipId, groupId);
}

export function activeMembershipOfUser(ctx, groupId, userId) {
  return ctx.sqlite
    .prepare(
      `SELECT id, group_id AS groupId, user_id AS userId, role, status FROM memberships
       WHERE group_id = ? AND user_id = ? AND status = 'active'`,
    )
    .get(groupId, userId);
}

/** Users that may be added to groups: verified and active (FR-GRP-04, E22). */
export function eligibleUsers(ctx, userIds) {
  if (userIds.length === 0) return [];
  return ctx.sqlite
    .prepare(
      `SELECT id, name FROM users
       WHERE status = 'active' AND email_verified_at IS NOT NULL
         AND id IN (${userIds.map(() => '?').join(',')})`,
    )
    .all(...userIds);
}

/** The caller's active groups, most recent activity first (G1). */
export function groupsOfUser(ctx, userId) {
  return ctx.sqlite
    .prepare(
      `SELECT g.id AS groupId, g.name, g.description, m.id AS membershipId, m.role AS myRole,
              (SELECT COUNT(*) FROM memberships x WHERE x.group_id = g.id AND x.status = 'active') AS memberCount,
              g.updated_at AS updatedAt,
              max(g.updated_at, COALESCE((SELECT MAX(created_at) FROM activity_events a WHERE a.group_id = g.id), '')) AS lastActivity
       FROM memberships m JOIN groups g ON g.id = m.group_id
       WHERE m.user_id = ? AND m.status = 'active'
       ORDER BY lastActivity DESC, g.id DESC`,
    )
    .all(userId);
}

/** Verified active users whose name matches, minus excluded IDs (U1). */
export function searchUsers(ctx, { q, excludeUserIds, limit = 10 }) {
  const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const exclude = excludeUserIds.length ? excludeUserIds : [0];
  return ctx.sqlite
    .prepare(
      `SELECT id AS userId, name, email FROM users
       WHERE status = 'active' AND email_verified_at IS NOT NULL
         AND name LIKE ? ESCAPE '\\'
         AND id NOT IN (${exclude.map(() => '?').join(',')})
       ORDER BY name COLLATE NOCASE, id
       LIMIT ?`,
    )
    .all(pattern, ...exclude, limit);
}
