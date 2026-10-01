// SQL for expenses and their shares (ADR-009).

const EXPENSE_COLUMNS = `
  e.id, e.group_id AS groupId, e.payer_membership_id AS payerMembershipId,
  e.created_by_membership_id AS createdByMembershipId, e.description, e.notes,
  e.amount_paise AS amountPaise, e.expense_date AS expenseDate, e.split_method AS splitMethod,
  e.status, e.created_at AS createdAt, e.updated_at AS updatedAt,
  e.updated_by_membership_id AS updatedByMembershipId, e.deleted_at AS deletedAt,
  e.deleted_by_membership_id AS deletedByMembershipId`;

export function findExpense(ctx, groupId, expenseId) {
  return ctx.sqlite
    .prepare(`SELECT ${EXPENSE_COLUMNS} FROM expenses e WHERE e.id = ? AND e.group_id = ?`)
    .get(expenseId, groupId);
}

/** Shares of many expenses at once, grouped by expense ID, in position order. */
export function sharesByExpense(ctx, expenseIds) {
  const result = new Map(expenseIds.map((id) => [id, []]));
  if (expenseIds.length === 0) return result;
  const rows = ctx.sqlite
    .prepare(
      `SELECT expense_id AS expenseId, membership_id AS membershipId, share_paise AS sharePaise,
              input_paise AS inputPaise, input_bp AS inputBp, position
       FROM expense_shares
       WHERE expense_id IN (${expenseIds.map(() => '?').join(',')})
       ORDER BY expense_id, position`,
    )
    .all(...expenseIds);
  for (const { expenseId, ...share } of rows) result.get(expenseId).push(share);
  return result;
}

/** E1 — active expenses with optional text / date / amount filters (FR-EXP-13). */
export function searchExpenses(ctx, groupId, { q, date, amountPaise, page, pageSize }) {
  const where = [`e.group_id = :groupId`, `e.status = 'active'`];
  const params = { groupId };
  if (q) {
    where.push(`(e.description LIKE :q ESCAPE '\\' OR e.notes LIKE :q ESCAPE '\\')`);
    params.q = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  }
  if (date) {
    where.push(`e.expense_date = :date`);
    params.date = date;
  }
  if (amountPaise) {
    where.push(`e.amount_paise = :amountPaise`);
    params.amountPaise = amountPaise;
  }
  const clause = where.join(' AND ');
  const total = ctx.sqlite
    .prepare(`SELECT COUNT(*) AS n FROM expenses e WHERE ${clause}`)
    .get(params).n;
  const items = ctx.sqlite
    .prepare(
      `SELECT ${EXPENSE_COLUMNS} FROM expenses e WHERE ${clause}
       ORDER BY e.expense_date DESC, e.id DESC
       LIMIT :limit OFFSET :offset`,
    )
    .all({ ...params, limit: pageSize, offset: (page - 1) * pageSize });
  return { items, total };
}

/**
 * Number of active settlements between the payer and any of the participants
 * (either direction) recorded after `since` — the FR-EXP-09 warning.
 */
export function countSettlementsSince(ctx, groupId, { payerMembershipIds, participantIds, since }) {
  if (participantIds.length === 0 || payerMembershipIds.length === 0) return 0;
  const payers = payerMembershipIds.map(() => '?').join(',');
  const others = participantIds.map(() => '?').join(',');
  return ctx.sqlite
    .prepare(
      `SELECT COUNT(*) AS n FROM settlements
       WHERE group_id = ? AND status = 'active' AND created_at > ?
         AND ((from_membership_id IN (${payers}) AND to_membership_id IN (${others}))
           OR (to_membership_id IN (${payers}) AND from_membership_id IN (${others})))`,
    )
    .get(
      groupId,
      since,
      ...payerMembershipIds,
      ...participantIds,
      ...payerMembershipIds,
      ...participantIds,
    ).n;
}

/** Change history of one expense or settlement, oldest first (E6 / S6). */
export function changeHistory(ctx, groupId, entityType, entityId) {
  return ctx.sqlite
    .prepare(
      `SELECT id, action, actor_membership_id AS actorMembershipId, before_json AS beforeJson,
              after_json AS afterJson, created_at AS createdAt
       FROM change_records
       WHERE group_id = ? AND entity_type = ? AND entity_id = ?
       ORDER BY id`,
    )
    .all(groupId, entityType, entityId);
}
