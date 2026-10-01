import { Router } from 'express';
import {
  addMemberBody,
  createGroupBody,
  deleteGroupQuery,
  leaveGroupBody,
  updateGroupBody,
} from '@splitbook/shared';
import { requireAuth } from '../../middleware/session.js';
import { requireAdmin, requireMember } from '../../middleware/membership.js';
import { validate } from '../../middleware/validate.js';
import {
  addMember,
  createGroup,
  deleteGroup,
  getGroupDetail,
  leaveGroup,
  listGroups,
  removeMember,
  updateGroup,
} from './service.js';

/** G1–G5, M1–M3 (API_CONTRACT §7), mounted at /api/groups. */
export function groupRoutes(ctx) {
  const router = Router();
  const member = requireMember(ctx);
  router.use(requireAuth);

  router.get('/', (req, res) => {
    res.json({ items: listGroups(ctx, req.user.id) });
  });

  router.post('/', validate({ body: createGroupBody }), (req, res) => {
    const { groupId, adminMembershipId } = createGroup(ctx, req.user, req.valid.body);
    res.status(201).json(getGroupDetail(ctx, groupId, adminMembershipId));
  });

  router.get('/:groupId', member, (req, res) => {
    res.json(getGroupDetail(ctx, req.group.id, req.membership.id));
  });

  router.patch('/:groupId', member, validate({ body: updateGroupBody }), (req, res) => {
    updateGroup(ctx, req.user, req.group, req.membership, req.valid.body);
    res.json(getGroupDetail(ctx, req.group.id, req.membership.id));
  });

  router.delete(
    '/:groupId',
    member,
    requireAdmin,
    validate({ query: deleteGroupQuery }),
    (req, res) => {
      deleteGroup(ctx, req.user, req.group, req.valid.query);
      res.status(204).end();
    },
  );

  router.post(
    '/:groupId/members',
    member,
    requireAdmin,
    validate({ body: addMemberBody }),
    (req, res) => {
      const ref = addMember(ctx, req.user, req.group, req.membership, req.valid.body.userId);
      res.status(201).json({ ...ref, role: 'member' });
    },
  );

  router.delete('/:groupId/members/:membershipId', member, requireAdmin, (req, res) => {
    removeMember(ctx, req.user, req.group, req.membership, Number(req.params.membershipId));
    res.status(204).end();
  });

  router.post('/:groupId/leave', member, validate({ body: leaveGroupBody }), (req, res) => {
    leaveGroup(ctx, req.user, req.group, req.membership, req.valid.body);
    res.status(204).end();
  });

  return router;
}
