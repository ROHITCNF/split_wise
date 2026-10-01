import { Router } from 'express';
import { AppError, balanceBreakdownQuery } from '@splitbook/shared';
import { validate } from '../../middleware/validate.js';
import { membershipsOfGroup } from '../groups/repository.js';
import { toMemberRef } from '../groups/service.js';
import { groupBalances, pairBreakdown } from './service.js';

/** B1–B2 (API_CONTRACT §8), mounted at /api/groups/:groupId/balances behind requireMember. */
export function balanceRoutes(ctx) {
  const router = Router({ mergeParams: true });

  const refs = (groupId) => {
    const byId = new Map(
      membershipsOfGroup(ctx, groupId).map((m) => [m.membershipId, toMemberRef(m)]),
    );
    return (id) => byId.get(id) ?? null;
  };

  router.get('/', (req, res) => {
    res.json(groupBalances(ctx, req.group.id, req.membership.id, refs(req.group.id)));
  });

  router.get('/breakdown', validate({ query: balanceBreakdownQuery }), (req, res) => {
    const { a, b } = req.valid.query;
    const toRef = refs(req.group.id);
    if (!toRef(a) || !toRef(b)) throw new AppError('NOT_FOUND');
    if (a === b)
      throw new AppError('VALIDATION_ERROR', { fieldErrors: { b: 'Pick two different people' } });

    const result = pairBreakdown(ctx, req.group.id, a, b);
    res.json({
      netPaise: result.netPaise,
      from: toRef(result.fromMembershipId),
      to: toRef(result.toMembershipId),
      items: result.items.map(({ paidBy, ...item }) => ({ ...item, paidBy: toRef(paidBy) })),
    });
  });

  return router;
}
