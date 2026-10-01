import { Router } from 'express';
import { changePasswordBody, updateProfileBody } from '@splitbook/shared';
import { requireAuth } from '../../middleware/session.js';
import { validate } from '../../middleware/validate.js';
import { endSession } from '../../lib/sessions.js';
import { findUserById, toUserDto } from './repository.js';
import { changePassword, deleteAccount, updateName } from './profileService.js';

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
