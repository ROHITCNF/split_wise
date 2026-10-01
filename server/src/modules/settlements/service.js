import { eq } from 'drizzle-orm';
import { AppError, CONFIRMATION_REASONS, formatPaise } from '@splitbook/shared';
import { settlements } from '../../db/schema.js';
import { nowIso } from '../../lib/time.js';
import { withTransaction } from '../../lib/transaction.js';
import { owedBetween } from '../balances/service.js';
import { changeHistory } from '../expenses/repository.js';
import { membershipsOfGroup } from '../groups/repository.js';
import { toMemberRef } from '../groups/service.js';
import { recordActivity, recordChange } from '../history/writers.js';
import { notify } from '../notifications/notify.js';

const firstName = (name) => name.split(' ')[0];

const COLUMNS = `
  id, group_id AS groupId, from_membership_id AS fromMembershipId,
  to_membership_id AS toMembershipId, amount_paise AS amountPaise,
  settlement_date AS settlementDate, note, recorded_by_membership_id AS recordedByMembershipId,
  status, created_at AS createdAt, updated_at AS updatedAt,
  updated_by_membership_id AS updatedByMembershipId`;

function memberDirectory(ctx, groupId) {
  return new Map(membershipsOfGroup(ctx, groupId).map((m) => [m.membershipId, m]));
}

function findSettlement(ctx, groupId, settlementId) {
  const row = ctx.sqlite
    .prepare(`SELECT ${COLUMNS} FROM settlements WHERE id = ? AND group_id = ?`)
    .get(settlementId, groupId);
  if (!row) throw new AppError('NOT_FOUND');
  return row;
}

const isParty = (s, membershipId) =>
  s.fromMembershipId === membershipId || s.toMembershipId === membershipId;

function departedParties(s, directory) {
  return [s.fromMembershipId, s.toMembershipId].filter(
    (id) => directory.get(id)?.status !== 'active',
  );
}

/** Settlement object (API_CONTRACT §10). */
function toDto(s, directory, caller) {
  const ref = (id) => (id ? toMemberRef(directory.get(id)) : null);
  const frozen = departedParties(s, directory).length > 0;
  const allowed = s.status === 'active' && !frozen && isParty(s, caller.id);
  return {
    settlementId: s.id,
    groupId: s.groupId,
    from: ref(s.fromMembershipId),
    to: ref(s.toMembershipId),
    amountPaise: s.amountPaise,
    settlementDate: s.settlementDate,
    note: s.note,
    recordedBy: ref(s.recordedByMembershipId),
    status: s.status,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    updatedBy: ref(s.updatedByMembershipId),
    permissions: {
      canEdit: allowed,
      canDelete: allowed,
      frozenReason: frozen ? 'INVOLVES_DEPARTED_MEMBER' : null,
    },
  };
}

function snapshot(s) {
  return {
    fromMembershipId: s.fromMembershipId,
    toMembershipId: s.toMembershipId,
    amountPaise: s.amountPaise,
    settlementDate: s.settlementDate,
    note: s.note,
  };
}

/**
 * Checks shared by record and edit (FR-STL-01..03): two different active members,
 * caller is one of them, and an over-payment needs confirmation.
 */
function validateBody(ctx, group, directory, caller, body, { excludeSettlementId } = {}) {
  if (body.fromMembershipId === body.toMembershipId) throw new AppError('SAME_PARTY');
  if (!isParty(body, caller.id)) throw new AppError('NOT_SETTLEMENT_PARTY');
  const inactive = departedParties(body, directory);
  if (inactive.length) {
    throw new AppError('PARTICIPANT_NOT_ACTIVE', { details: { membershipIds: inactive } });
  }
  if (!body.confirm) {
    const owedPaise = owedBetween(ctx, group.id, body.fromMembershipId, body.toMembershipId, {
      excludeSettlementId,
    });
    if (body.amountPaise > owedPaise) {
      throw new AppError('CONFIRMATION_REQUIRED', {
        message: "This is more than what's owed.",
        details: {
          reason: CONFIRMATION_REASONS.OVERPAYMENT,
          owedPaise: Math.max(0, owedPaise),
          amountPaise: body.amountPaise,
        },
      });
    }
  }
}

/** Notifies the other party (FR-STL-04). */
function notifyOtherParty(ctx, { group, actor, caller, s, directory, type, text }) {
  const otherId = s.fromMembershipId === caller.id ? s.toMembershipId : s.fromMembershipId;
  notify(ctx, {
    recipientUserIds: [directory.get(otherId).userId],
    actorUserId: actor.id,
    group: { id: group.id, name: group.name },
    type,
    entityType: 'settlement',
    entityId: s.id,
    message: text,
  });
}

function describePayment(directory, s) {
  return `${firstName(directory.get(s.fromMembershipId).name)} paid ${firstName(
    directory.get(s.toMembershipId).name,
  )} ${formatPaise(s.amountPaise)}`;
}

// ── Reads ────────────────────────────────────────────────────────────────

/** S1 — active only, newest first (FR-STL-07). */
export function listSettlements(ctx, group, caller, { page, pageSize }) {
  const directory = memberDirectory(ctx, group.id);
  const total = ctx.sqlite
    .prepare(`SELECT COUNT(*) AS n FROM settlements WHERE group_id = ? AND status = 'active'`)
    .get(group.id).n;
  const rows = ctx.sqlite
    .prepare(
      `SELECT ${COLUMNS} FROM settlements WHERE group_id = ? AND status = 'active'
       ORDER BY settlement_date DESC, id DESC LIMIT ? OFFSET ?`,
    )
    .all(group.id, pageSize, (page - 1) * pageSize);
  return { items: rows.map((s) => toDto(s, directory, caller)), page, pageSize, total };
}

/** S3 */
export function getSettlement(ctx, group, caller, settlementId) {
  return toDto(findSettlement(ctx, group.id, settlementId), memberDirectory(ctx, group.id), caller);
}

/** S6 */
export function getSettlementHistory(ctx, group, settlementId) {
  findSettlement(ctx, group.id, settlementId);
  const directory = memberDirectory(ctx, group.id);
  return changeHistory(ctx, group.id, 'settlement', settlementId).map((c) => ({
    id: c.id,
    action: c.action,
    actor: toMemberRef(directory.get(c.actorMembershipId)),
    createdAt: c.createdAt,
    before: c.beforeJson ? JSON.parse(c.beforeJson) : null,
    after: c.afterJson ? JSON.parse(c.afterJson) : null,
  }));
}

// ── Commands ─────────────────────────────────────────────────────────────

/** S2 — returns the settlement ID. Duplicates are not detected (FR-STL-06). */
export function recordSettlement(ctx, actor, group, caller, body) {
  return withTransaction(ctx, () => {
    const directory = memberDirectory(ctx, group.id);
    validateBody(ctx, group, directory, caller, body);

    const now = nowIso();
    const id = Number(
      ctx.db
        .insert(settlements)
        .values({
          groupId: group.id,
          fromMembershipId: body.fromMembershipId,
          toMembershipId: body.toMembershipId,
          amountPaise: body.amountPaise,
          settlementDate: body.settlementDate,
          note: body.note,
          recordedByMembershipId: caller.id,
          createdAt: now,
          updatedAt: now,
        })
        .run().lastInsertRowid,
    );
    const s = findSettlement(ctx, group.id, id);
    recordChange(ctx, {
      groupId: group.id,
      entityType: 'settlement',
      entityId: id,
      action: 'created',
      actorMembershipId: caller.id,
      after: snapshot(s),
    });
    recordActivity(ctx, {
      groupId: group.id,
      actorMembershipId: caller.id,
      type: 'settlement_created',
      subjectType: 'settlement',
      subjectId: id,
      summary: describePayment(directory, s),
    });
    const text =
      s.fromMembershipId === caller.id
        ? `${firstName(actor.name)} recorded a payment of ${formatPaise(s.amountPaise)} to you`
        : `${firstName(actor.name)} recorded that you paid ${formatPaise(s.amountPaise)}`;
    notifyOtherParty(ctx, { group, actor, caller, s, directory, type: 'settlement_created', text });
    return id;
  });
}

/** Guards shared by edit and delete (FR-STL-05, FR-STL-09). */
function assertCanChange(s, directory, caller) {
  if (!isParty(s, caller.id)) throw new AppError('NOT_SETTLEMENT_PARTY');
  if (s.status === 'deleted') throw new AppError('SETTLEMENT_DELETED');
  const departed = departedParties(s, directory);
  if (departed.length) {
    throw new AppError('INVOLVES_DEPARTED_MEMBER', { details: { membershipIds: departed } });
  }
}

/** S4 — over-payment is checked against the balance without this settlement. */
export function updateSettlement(ctx, actor, group, caller, settlementId, body) {
  withTransaction(ctx, () => {
    const directory = memberDirectory(ctx, group.id);
    const before = findSettlement(ctx, group.id, settlementId);
    assertCanChange(before, directory, caller);
    validateBody(ctx, group, directory, caller, body, { excludeSettlementId: settlementId });

    ctx.db
      .update(settlements)
      .set({
        fromMembershipId: body.fromMembershipId,
        toMembershipId: body.toMembershipId,
        amountPaise: body.amountPaise,
        settlementDate: body.settlementDate,
        note: body.note,
        updatedAt: nowIso(),
        updatedByMembershipId: caller.id,
      })
      .where(eq(settlements.id, settlementId))
      .run();
    const after = findSettlement(ctx, group.id, settlementId);
    recordChange(ctx, {
      groupId: group.id,
      entityType: 'settlement',
      entityId: settlementId,
      action: 'updated',
      actorMembershipId: caller.id,
      before: snapshot(before),
      after: snapshot(after),
    });
    recordActivity(ctx, {
      groupId: group.id,
      actorMembershipId: caller.id,
      type: 'settlement_updated',
      subjectType: 'settlement',
      subjectId: settlementId,
      summary: `${firstName(actor.name)} edited a payment: ${describePayment(directory, after)}`,
    });
    notifyOtherParty(ctx, {
      group,
      actor,
      caller,
      s: after,
      directory,
      type: 'settlement_updated',
      text: `${firstName(actor.name)} edited a payment: ${describePayment(directory, after)}`,
    });
  });
}

/** S5 — soft delete. */
export function deleteSettlement(ctx, actor, group, caller, settlementId) {
  withTransaction(ctx, () => {
    const directory = memberDirectory(ctx, group.id);
    const s = findSettlement(ctx, group.id, settlementId);
    assertCanChange(s, directory, caller);

    const now = nowIso();
    ctx.db
      .update(settlements)
      .set({ status: 'deleted', deletedAt: now, deletedByMembershipId: caller.id, updatedAt: now })
      .where(eq(settlements.id, settlementId))
      .run();
    recordChange(ctx, {
      groupId: group.id,
      entityType: 'settlement',
      entityId: settlementId,
      action: 'deleted',
      actorMembershipId: caller.id,
      before: snapshot(s),
    });
    recordActivity(ctx, {
      groupId: group.id,
      actorMembershipId: caller.id,
      type: 'settlement_deleted',
      subjectType: 'settlement',
      subjectId: settlementId,
      summary: `${firstName(actor.name)} deleted a payment: ${describePayment(directory, s)}`,
    });
    notifyOtherParty(ctx, {
      group,
      actor,
      caller,
      s,
      directory,
      type: 'settlement_deleted',
      text: `${firstName(actor.name)} deleted a payment: ${describePayment(directory, s)}`,
    });
  });
}
