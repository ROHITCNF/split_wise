import { eq } from 'drizzle-orm';
import { AppError, CONFIRMATION_REASONS, computeShares, formatPaise } from '@splitbook/shared';
import { expenseShares, expenses } from '../../db/schema.js';
import { nowIso } from '../../lib/time.js';
import { withTransaction } from '../../lib/transaction.js';
import { recordActivity, recordChange } from '../history/writers.js';
import { notify } from '../notifications/notify.js';
import { membershipsOfGroup } from '../groups/repository.js';
import { toMemberRef } from '../groups/service.js';
import {
  changeHistory,
  countSettlementsSince,
  findExpense,
  searchExpenses,
  sharesByExpense,
} from './repository.js';

const firstName = (name) => name.split(' ')[0];

/** Everyone in the group (active and past), keyed by membership ID. */
function memberDirectory(ctx, groupId) {
  return new Map(membershipsOfGroup(ctx, groupId).map((m) => [m.membershipId, m]));
}

/** Membership IDs among `ids` that are not active members of the group. */
function inactiveAmong(directory, ids) {
  return [...new Set(ids)].filter((id) => directory.get(id)?.status !== 'active');
}

function involvedIds(expense, shares) {
  return [expense.payerMembershipId, ...shares.map((s) => s.membershipId)];
}

/** What the caller may do with an expense (FR-EXP-06, FR-EXP-16). */
function permissionsFor(expense, shares, directory, caller) {
  const frozen = inactiveAmong(directory, involvedIds(expense, shares)).length > 0;
  const allowed =
    expense.status === 'active' &&
    !frozen &&
    (expense.createdByMembershipId === caller.id || caller.role === 'admin');
  return {
    canEdit: allowed,
    canDelete: allowed,
    frozenReason: frozen ? 'INVOLVES_DEPARTED_MEMBER' : null,
  };
}

/** Expense object (API_CONTRACT §9). `withShares: false` for list rows. */
function toExpenseDto(expense, shares, directory, caller, { withShares = true } = {}) {
  const ref = (id) => (id ? toMemberRef(directory.get(id)) : null);
  const mine = shares.find((s) => s.membershipId === caller.id);
  return {
    expenseId: expense.id,
    groupId: expense.groupId,
    description: expense.description,
    notes: expense.notes,
    amountPaise: expense.amountPaise,
    expenseDate: expense.expenseDate,
    splitMethod: expense.splitMethod,
    payer: ref(expense.payerMembershipId),
    createdBy: ref(expense.createdByMembershipId),
    ...(withShares && {
      shares: shares.map((s) => ({
        member: ref(s.membershipId),
        sharePaise: s.sharePaise,
        inputPaise: s.inputPaise,
        inputBp: s.inputBp,
        position: s.position,
      })),
    }),
    myShare: mine ? { sharePaise: mine.sharePaise } : null,
    status: expense.status,
    createdAt: expense.createdAt,
    updatedAt: expense.updatedAt,
    updatedBy: ref(expense.updatedByMembershipId),
    permissions: permissionsFor(expense, shares, directory, caller),
  };
}

/** Snapshot stored in change records (before/after). */
function snapshot(expense, shares) {
  return {
    description: expense.description,
    notes: expense.notes,
    amountPaise: expense.amountPaise,
    expenseDate: expense.expenseDate,
    payerMembershipId: expense.payerMembershipId,
    splitMethod: expense.splitMethod,
    shares: shares.map(({ membershipId, sharePaise, inputPaise, inputBp, position }) => ({
      membershipId,
      sharePaise,
      inputPaise,
      inputBp,
      position,
    })),
  };
}

function loadExpense(ctx, groupId, expenseId) {
  const expense = findExpense(ctx, groupId, expenseId);
  if (!expense) throw new AppError('NOT_FOUND');
  return { expense, shares: sharesByExpense(ctx, [expense.id]).get(expense.id) };
}

/** Payer and participants must be active members; then the split engine decides shares. */
function validateAndSplit(directory, body) {
  if (directory.get(body.payerMembershipId)?.status !== 'active')
    throw new AppError('PAYER_NOT_ACTIVE');
  const inactive = inactiveAmong(
    directory,
    body.participants.map((p) => p.membershipId),
  );
  if (inactive.length)
    throw new AppError('PARTICIPANT_NOT_ACTIVE', { details: { membershipIds: inactive } });

  const split = computeShares(body);
  if (!split.ok) {
    throw new AppError(split.code, { details: split.details, fieldErrors: split.fieldErrors });
  }
  return split.shares;
}

function insertShares(ctx, expenseId, shares) {
  ctx.db
    .insert(expenseShares)
    .values(shares.map((s) => ({ expenseId, ...s })))
    .run();
}

/**
 * One notification per involved person (payer + participants, minus the actor);
 * participants see their own share in the message.
 */
function notifyInvolved(ctx, { group, actor, expense, shares, directory, type, verb }) {
  const shareOf = new Map(shares.map((s) => [s.membershipId, s.sharePaise]));
  for (const membershipId of new Set(involvedIds(expense, shares))) {
    const person = directory.get(membershipId);
    const share = shareOf.get(membershipId);
    notify(ctx, {
      recipientUserIds: [person.userId],
      actorUserId: actor.id,
      group: { id: group.id, name: group.name },
      type,
      entityType: 'expense',
      entityId: expense.id,
      message:
        `${firstName(actor.name)} ${verb} '${expense.description}'` +
        (share !== undefined && type !== 'expense_deleted'
          ? ` — your share ${formatPaise(share)}`
          : ` ${formatPaise(expense.amountPaise)}`),
    });
  }
}

// ── Reads ────────────────────────────────────────────────────────────────

/** E1 */
export function listExpenses(ctx, group, caller, query) {
  const directory = memberDirectory(ctx, group.id);
  const { items, total } = searchExpenses(ctx, group.id, query);
  const shares = sharesByExpense(
    ctx,
    items.map((e) => e.id),
  );
  return {
    items: items.map((e) =>
      toExpenseDto(e, shares.get(e.id), directory, caller, { withShares: false }),
    ),
    page: query.page,
    pageSize: query.pageSize,
    total,
  };
}

/** E3 — deleted expenses are returned too, so history links work. */
export function getExpense(ctx, group, caller, expenseId) {
  const { expense, shares } = loadExpense(ctx, group.id, expenseId);
  return toExpenseDto(expense, shares, memberDirectory(ctx, group.id), caller);
}

/** E6 */
export function getExpenseHistory(ctx, group, expenseId) {
  loadExpense(ctx, group.id, expenseId);
  const directory = memberDirectory(ctx, group.id);
  return changeHistory(ctx, group.id, 'expense', expenseId).map((c) => ({
    id: c.id,
    action: c.action,
    actor: toMemberRef(directory.get(c.actorMembershipId)),
    createdAt: c.createdAt,
    before: c.beforeJson ? JSON.parse(c.beforeJson) : null,
    after: c.afterJson ? JSON.parse(c.afterJson) : null,
  }));
}

// ── Commands ─────────────────────────────────────────────────────────────

/** E2 — any member (FR-EXP-01..05). Returns the expense ID. */
export function createExpense(ctx, actor, group, caller, body) {
  return withTransaction(ctx, () => {
    const directory = memberDirectory(ctx, group.id);
    const shares = validateAndSplit(directory, body);
    const now = nowIso();
    const expenseId = Number(
      ctx.db
        .insert(expenses)
        .values({
          groupId: group.id,
          payerMembershipId: body.payerMembershipId,
          createdByMembershipId: caller.id,
          description: body.description,
          notes: body.notes,
          amountPaise: body.amountPaise,
          expenseDate: body.expenseDate,
          splitMethod: body.splitMethod,
          createdAt: now,
          updatedAt: now,
        })
        .run().lastInsertRowid,
    );
    insertShares(ctx, expenseId, shares);

    const expense = findExpense(ctx, group.id, expenseId);
    recordChange(ctx, {
      groupId: group.id,
      entityType: 'expense',
      entityId: expenseId,
      action: 'created',
      actorMembershipId: caller.id,
      after: snapshot(expense, shares),
    });
    recordActivity(ctx, {
      groupId: group.id,
      actorMembershipId: caller.id,
      type: 'expense_created',
      subjectType: 'expense',
      subjectId: expenseId,
      summary: `${firstName(actor.name)} added '${expense.description}' ${formatPaise(expense.amountPaise)}`,
    });
    notifyInvolved(ctx, {
      group,
      actor,
      expense,
      shares,
      directory,
      type: 'expense_created',
      verb: 'added',
    });
    return expenseId;
  });
}

/** Shared guards for edit and delete (FR-EXP-06, FR-EXP-16). */
function assertCanChange(expense, shares, directory, caller) {
  if (expense.createdByMembershipId !== caller.id && caller.role !== 'admin') {
    throw new AppError('FORBIDDEN');
  }
  if (expense.status === 'deleted') throw new AppError('EXPENSE_DELETED');
  const departed = inactiveAmong(directory, involvedIds(expense, shares));
  if (departed.length) {
    throw new AppError('INVOLVES_DEPARTED_MEMBER', { details: { membershipIds: departed } });
  }
}

/** E4 — creator or admin; split method locked; settlement warning (FR-EXP-06..09, FR-EXP-12). */
export function updateExpense(ctx, actor, group, caller, expenseId, body) {
  return withTransaction(ctx, () => {
    const directory = memberDirectory(ctx, group.id);
    const { expense: before, shares: beforeShares } = loadExpense(ctx, group.id, expenseId);
    assertCanChange(before, beforeShares, directory, caller);
    if (body.splitMethod !== before.splitMethod) throw new AppError('SPLIT_METHOD_LOCKED');

    const shares = validateAndSplit(directory, body);

    if (!body.confirm) {
      const settlementCount = countSettlementsSince(ctx, group.id, {
        payerMembershipIds: [...new Set([before.payerMembershipId, body.payerMembershipId])],
        participantIds: [...new Set([...beforeShares, ...shares].map((s) => s.membershipId))],
        since: before.createdAt,
      });
      if (settlementCount > 0) {
        throw new AppError('CONFIRMATION_REQUIRED', {
          message: 'Payments were recorded after this expense. Editing it will change balances.',
          details: { reason: CONFIRMATION_REASONS.SETTLEMENT_EXISTS, settlementCount },
        });
      }
    }

    ctx.db
      .update(expenses)
      .set({
        description: body.description,
        notes: body.notes,
        amountPaise: body.amountPaise,
        expenseDate: body.expenseDate,
        payerMembershipId: body.payerMembershipId,
        updatedAt: nowIso(),
        updatedByMembershipId: caller.id,
      })
      .where(eq(expenses.id, expenseId))
      .run();
    ctx.db.delete(expenseShares).where(eq(expenseShares.expenseId, expenseId)).run();
    insertShares(ctx, expenseId, shares);

    const after = findExpense(ctx, group.id, expenseId);
    recordChange(ctx, {
      groupId: group.id,
      entityType: 'expense',
      entityId: expenseId,
      action: 'updated',
      actorMembershipId: caller.id,
      before: snapshot(before, beforeShares),
      after: snapshot(after, shares),
    });
    const amountChange =
      before.amountPaise === after.amountPaise
        ? ''
        : ` ${formatPaise(before.amountPaise)} → ${formatPaise(after.amountPaise)}`;
    recordActivity(ctx, {
      groupId: group.id,
      actorMembershipId: caller.id,
      type: 'expense_updated',
      subjectType: 'expense',
      subjectId: expenseId,
      summary: `${firstName(actor.name)} edited '${after.description}'${amountChange}`,
    });
    // Everyone involved before or after the edit hears about it.
    notifyInvolved(ctx, {
      group,
      actor,
      expense: after,
      shares,
      directory,
      type: 'expense_updated',
      verb: 'edited',
    });
    const stillInvolved = new Set(involvedIds(after, shares));
    const dropped = [...new Set(involvedIds(before, beforeShares))].filter(
      (id) => !stillInvolved.has(id),
    );
    notify(ctx, {
      recipientUserIds: dropped.map((id) => directory.get(id).userId),
      actorUserId: actor.id,
      group: { id: group.id, name: group.name },
      type: 'expense_updated',
      entityType: 'expense',
      entityId: expenseId,
      message: `${firstName(actor.name)} edited '${after.description}' — you're no longer part of it`,
    });
  });
}

/** E5 — soft delete (FR-EXP-10). */
export function deleteExpense(ctx, actor, group, caller, expenseId) {
  withTransaction(ctx, () => {
    const directory = memberDirectory(ctx, group.id);
    const { expense, shares } = loadExpense(ctx, group.id, expenseId);
    assertCanChange(expense, shares, directory, caller);

    const now = nowIso();
    ctx.db
      .update(expenses)
      .set({ status: 'deleted', deletedAt: now, deletedByMembershipId: caller.id, updatedAt: now })
      .where(eq(expenses.id, expenseId))
      .run();
    recordChange(ctx, {
      groupId: group.id,
      entityType: 'expense',
      entityId: expenseId,
      action: 'deleted',
      actorMembershipId: caller.id,
      before: snapshot(expense, shares),
    });
    recordActivity(ctx, {
      groupId: group.id,
      actorMembershipId: caller.id,
      type: 'expense_deleted',
      subjectType: 'expense',
      subjectId: expenseId,
      summary: `${firstName(actor.name)} deleted '${expense.description}' ${formatPaise(expense.amountPaise)}`,
    });
    notifyInvolved(ctx, {
      group,
      actor,
      expense,
      shares,
      directory,
      type: 'expense_deleted',
      verb: 'deleted',
    });
  });
}
