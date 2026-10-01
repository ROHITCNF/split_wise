import { Router } from 'express';
import { activityListQuery, settlementBody, settlementListQuery } from '@splitbook/shared';
import { validate } from '../../middleware/validate.js';
import { membershipsOfGroup } from '../groups/repository.js';
import { toMemberRef } from '../groups/service.js';
import {
  deleteSettlement,
  getSettlement,
  getSettlementHistory,
  listSettlements,
  recordSettlement,
  updateSettlement,
} from './service.js';

/** S1–S6 (API_CONTRACT §10), mounted at /api/groups/:groupId/settlements behind requireMember. */
export function settlementRoutes(ctx) {
  const router = Router({ mergeParams: true });
  const settlementId = (req) => Number(req.params.settlementId);

  router.get('/', validate({ query: settlementListQuery }), (req, res) => {
    res.json(listSettlements(ctx, req.group, req.membership, req.valid.query));
  });

  router.post('/', validate({ body: settlementBody }), (req, res) => {
    const id = recordSettlement(ctx, req.user, req.group, req.membership, req.valid.body);
    res.status(201).json(getSettlement(ctx, req.group, req.membership, id));
  });

  router.get('/:settlementId', (req, res) => {
    res.json(getSettlement(ctx, req.group, req.membership, settlementId(req)));
  });

  router.put('/:settlementId', validate({ body: settlementBody }), (req, res) => {
    updateSettlement(ctx, req.user, req.group, req.membership, settlementId(req), req.valid.body);
    res.json(getSettlement(ctx, req.group, req.membership, settlementId(req)));
  });

  router.delete('/:settlementId', (req, res) => {
    deleteSettlement(ctx, req.user, req.group, req.membership, settlementId(req));
    res.status(204).end();
  });

  router.get('/:settlementId/history', (req, res) => {
    res.json({ items: getSettlementHistory(ctx, req.group, settlementId(req)) });
  });

  return router;
}

/** AC1 (API_CONTRACT §11), mounted at /api/groups/:groupId/activity behind requireMember. */
export function activityRoutes(ctx) {
  const router = Router({ mergeParams: true });

  router.get('/', validate({ query: activityListQuery }), (req, res) => {
    const { page, pageSize } = req.valid.query;
    const refs = new Map(
      membershipsOfGroup(ctx, req.group.id).map((m) => [m.membershipId, toMemberRef(m)]),
    );
    const total = ctx.sqlite
      .prepare(`SELECT COUNT(*) AS n FROM activity_events WHERE group_id = ?`)
      .get(req.group.id).n;
    const rows = ctx.sqlite
      .prepare(
        `SELECT id, type, actor_membership_id AS actorId, subject_type AS subjectType,
                subject_id AS subjectId, summary, created_at AS createdAt
         FROM activity_events WHERE group_id = ?
         ORDER BY id DESC LIMIT ? OFFSET ?`,
      )
      .all(req.group.id, pageSize, (page - 1) * pageSize);
    res.json({
      items: rows.map((r) => ({
        id: r.id,
        type: r.type,
        actor: r.actorId ? refs.get(r.actorId) : null,
        subject: r.subjectType ? { type: r.subjectType, id: r.subjectId } : null,
        summary: r.summary,
        createdAt: r.createdAt,
      })),
      page,
      pageSize,
      total,
    });
  });

  return router;
}
