import { Router } from 'express';
import {
  AppError,
  changePasswordBody,
  updateProfileBody,
  userSearchQuery,
} from '@splitbook/shared';
import { requireAuth } from '../../middleware/session.js';
import { validate } from '../../middleware/validate.js';
import { endSession } from '../../lib/sessions.js';
import { findUserById, toUserDto } from './repository.js';
import { changePassword, deleteAccount, updateName } from './profileService.js';
import { activeMembershipOfUser, membershipsOfGroup, searchUsers } from '../groups/repository.js';

/** P1–P3 (API_CONTRACT §4), mounted at /api/me. */
export function profileRoutes(ctx) {
  const router = Router();
  router.use(requireAuth);

  router.patch('/', validate({ body: updateProfileBody }), (req, res) => {
    updateName(ctx, req.user.id, req.valid.body.name);
    res.json({ user: toUserDto(ctx, findUserById(ctx, req.user.id)) });
  });

  router.post('/password', validate({ body: changePasswordBody }), async (req, res) => {
    await changePassword(ctx, req.user.id, req.valid.body);
    res.status(204).end();
  });

  router.delete('/', (req, res) => {
    deleteAccount(ctx, req.user);
    endSession(ctx, res, null); // rows already removed; just clear the cookie
    res.status(204).end();
  });

  return router;
}

/** U1 (API_CONTRACT §5), mounted at /api/users. */
export function userRoutes(ctx) {
  const router = Router();
  router.use(requireAuth);

  router.get('/search', validate({ query: userSearchQuery }), (req, res) => {
    const { q, groupId } = req.valid.query;
    const excludeUserIds = [req.user.id];
    if (groupId !== undefined) {
      if (!activeMembershipOfUser(ctx, groupId, req.user.id)) throw new AppError('NOT_FOUND');
      for (const m of membershipsOfGroup(ctx, groupId)) {
        if (m.status === 'active') excludeUserIds.push(m.userId);
      }
    }
    res.json({ items: searchUsers(ctx, { q, excludeUserIds }) });
  });

  return router;
}
