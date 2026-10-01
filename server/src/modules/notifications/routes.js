import { Router } from 'express';
import { AppError, notificationListQuery } from '@splitbook/shared';
import { requireAuth } from '../../middleware/session.js';
import { validate } from '../../middleware/validate.js';
import { nowIso } from '../../lib/time.js';

/** Link target for the UI; null once the group is deleted (FR-NTF-05). */
function linkOf(row) {
  if (row.groupId === null) return null;
  if (!row.entityType || row.entityType === 'group') {
    return { type: 'group', groupId: row.groupId, id: row.groupId };
  }
  return { type: row.entityType, groupId: row.groupId, id: row.entityId };
}

/** N1–N4 (API_CONTRACT §11), mounted at /api/notifications. */
export function notificationRoutes(ctx) {
  const router = Router();
  router.use(requireAuth);

  router.get('/', validate({ query: notificationListQuery }), (req, res) => {
    const { unreadOnly, page, pageSize } = req.valid.query;
    const where = `recipient_user_id = ?${unreadOnly ? ' AND read_at IS NULL' : ''}`;
    const total = ctx.sqlite
      .prepare(`SELECT COUNT(*) AS n FROM notifications WHERE ${where}`)
      .get(req.user.id).n;
    const rows = ctx.sqlite
      .prepare(
        `SELECT id, type, message, group_id AS groupId, group_name AS groupName,
                entity_type AS entityType, entity_id AS entityId, read_at AS readAt, created_at AS createdAt
         FROM notifications WHERE ${where}
         ORDER BY id DESC LIMIT ? OFFSET ?`,
      )
      .all(req.user.id, pageSize, (page - 1) * pageSize);
    res.json({
      items: rows.map((r) => ({
        notificationId: r.id,
        type: r.type,
        message: r.message,
        groupId: r.groupId,
        groupName: r.groupName,
        link: linkOf(r),
        read: r.readAt !== null,
        createdAt: r.createdAt,
      })),
      page,
      pageSize,
      total,
    });
  });

  // N2 — polled every 60 s (ADR-008); served by the partial unread index.
  router.get('/unread-count', (req, res) => {
    const { count } = ctx.sqlite
      .prepare(
        `SELECT COUNT(*) AS count FROM notifications WHERE recipient_user_id = ? AND read_at IS NULL`,
      )
      .get(req.user.id);
    res.json({ count });
  });

  router.post('/read-all', (req, res) => {
    ctx.sqlite
      .prepare(
        `UPDATE notifications SET read_at = ? WHERE recipient_user_id = ? AND read_at IS NULL`,
      )
      .run(nowIso(), req.user.id);
    res.status(204).end();
  });

  // N3 — someone else's notification looks the same as a missing one.
  router.post('/:notificationId/read', (req, res) => {
    const { changes } = ctx.sqlite
      .prepare(
        `UPDATE notifications SET read_at = COALESCE(read_at, ?)
         WHERE id = ? AND recipient_user_id = ?`,
      )
      .run(nowIso(), Number(req.params.notificationId), req.user.id);
    if (changes === 0) throw new AppError('NOT_FOUND');
    res.status(204).end();
  });

  return router;
}
