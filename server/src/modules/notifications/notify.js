import { notifications } from '../../db/schema.js';
import { nowIso } from '../../lib/time.js';

/**
 * Creates in-app notifications inside the caller's transaction (ADR-007).
 * The actor never notifies themself (DOMAIN §2.11). The group name and message are
 * stored as text so they survive group deletion (FR-NTF-05).
 * @param {object} ctx
 * @param {{ recipientUserIds: number[], actorUserId?: number|null,
 *           group: { id: number|null, name: string }, type: string,
 *           entityType?: string|null, entityId?: number|null, message: string }} notification
 * @returns {number} how many notifications were created
 */
export function notify(
  ctx,
  {
    recipientUserIds,
    actorUserId = null,
    group,
    type,
    entityType = null,
    entityId = null,
    message,
  },
) {
  const recipients = [...new Set(recipientUserIds)].filter((id) => id !== actorUserId);
  if (recipients.length === 0) return 0;

  const createdAt = nowIso();
  ctx.db
    .insert(notifications)
    .values(
      recipients.map((recipientUserId) => ({
        recipientUserId,
        actorUserId,
        groupId: group.id,
        groupName: group.name,
        type,
        entityType,
        entityId,
        message,
        createdAt,
      })),
    )
    .run();
  return recipients.length;
}
