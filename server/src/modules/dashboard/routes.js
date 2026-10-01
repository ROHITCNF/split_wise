import { Router } from 'express';
import { requireAuth } from '../../middleware/session.js';
import { overallTotals } from '../balances/service.js';
import { groupsOfUser } from '../groups/repository.js';
import { listGroups } from '../groups/service.js';

/** D1 (API_CONTRACT §6), mounted at /api/dashboard. */
export function dashboardRoutes(ctx) {
  const router = Router();
  router.use(requireAuth);

  router.get('/', (req, res) => {
    const memberships = groupsOfUser(ctx, req.user.id);
    const recentActivity = ctx.sqlite
      .prepare(
        `SELECT a.id, a.group_id AS groupId, g.name AS groupName, a.type, a.summary, a.created_at AS createdAt
         FROM activity_events a
         JOIN groups g ON g.id = a.group_id
         JOIN memberships m ON m.group_id = a.group_id AND m.user_id = ? AND m.status = 'active'
         ORDER BY a.id DESC
         LIMIT 10`,
      )
      .all(req.user.id);

    res.json({
      totals: overallTotals(ctx, memberships),
      groups: listGroups(ctx, req.user.id).map(({ groupId, name, myNetPaise, memberCount }) => ({
        groupId,
        name,
        netPaise: myNetPaise,
        memberCount,
      })),
      recentActivity,
    });
  });

  return router;
}
