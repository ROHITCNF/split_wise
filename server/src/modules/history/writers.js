import { activityEvents, changeRecords } from '../../db/schema.js';
import { nowIso } from '../../lib/time.js';

// Called inside the caller's transaction (ADR-007). Both tables are append-only.

/**
 * Stores a before/after snapshot of an expense or settlement (FR-EXP-11).
 * @param {object} ctx
 * @param {{ groupId: number, entityType: 'expense'|'settlement', entityId: number,
 *           action: 'created'|'updated'|'deleted', actorMembershipId: number,
 *           before?: object|null, after?: object|null }} change
 */
export function recordChange(
  ctx,
  { groupId, entityType, entityId, action, actorMembershipId, before, after },
) {
  ctx.db
    .insert(changeRecords)
    .values({
      groupId,
      entityType,
      entityId,
      action,
      actorMembershipId,
      beforeJson: before ? JSON.stringify(before) : null,
      afterJson: after ? JSON.stringify(after) : null,
      createdAt: nowIso(),
    })
    .run();
}

/**
 * Adds a line to the group's activity feed (FR-ACT-01). `summary` is stored as
 * rendered text so the feed reads correctly even after names or amounts change.
 * @param {object} ctx
 * @param {{ groupId: number, actorMembershipId?: number|null, type: string,
 *           subjectType?: string|null, subjectId?: number|null, summary: string }} event
 */
export function recordActivity(
  ctx,
  { groupId, actorMembershipId = null, type, subjectType = null, subjectId = null, summary },
) {
  ctx.db
    .insert(activityEvents)
    .values({
      groupId,
      actorMembershipId,
      type,
      subjectType,
      subjectId,
      summary,
      createdAt: nowIso(),
    })
    .run();
}
