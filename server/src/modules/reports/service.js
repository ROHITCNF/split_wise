import { AppError, formatPeriodLabel, monthRange, todayIST, weekRange } from '@splitbook/shared';
import { activeMembershipOfUser } from '../groups/repository.js';

/**
 * R1 — personal report for an IST week (Mon–Sun) or month (FR-RPT-01..05).
 * Covers the caller's current groups (all, or one via `groupId`), assigned to
 * periods by expense / settlement date.
 */
export function buildReport(ctx, user, { period, date = todayIST(), groupId }) {
  if (groupId !== undefined && !activeMembershipOfUser(ctx, groupId, user.id)) {
    throw new AppError('NOT_FOUND');
  }
  const { from, to } = period === 'week' ? weekRange(date) : monthRange(date);
  const params = { userId: user.id, from, to, groupId: groupId ?? null };

  // My active memberships in scope.
  const MINE = `
    SELECT m.id FROM memberships m
    WHERE m.user_id = :userId AND m.status = 'active'
      AND (:groupId IS NULL OR m.group_id = :groupId)`;

  const expenses = ctx.sqlite
    .prepare(
      `SELECT e.id AS expenseId, e.expense_date AS date, g.id AS groupId, g.name AS groupName,
              e.description, e.amount_paise AS amountPaise, e.split_method AS splitMethod,
              p.id AS payerMembershipId, pu.id AS payerUserId, pu.name AS payerName, p.status AS payerStatus,
              (SELECT s.share_paise FROM expense_shares s
                WHERE s.expense_id = e.id AND s.membership_id IN (${MINE})) AS mySharePaise,
              (e.payer_membership_id IN (${MINE})) AS iPaid
       FROM expenses e
       JOIN groups g ON g.id = e.group_id
       JOIN memberships p ON p.id = e.payer_membership_id
       JOIN users pu ON pu.id = p.user_id
       WHERE e.status = 'active' AND e.expense_date BETWEEN :from AND :to
         AND (e.payer_membership_id IN (${MINE})
              OR EXISTS (SELECT 1 FROM expense_shares s
                         WHERE s.expense_id = e.id AND s.membership_id IN (${MINE})))
       ORDER BY e.expense_date DESC, e.id DESC`,
    )
    .all(params);

  const settlements = ctx.sqlite
    .prepare(
      `SELECT st.id AS settlementId, st.settlement_date AS date, g.id AS groupId, g.name AS groupName,
              st.amount_paise AS amountPaise, st.note,
              f.id AS fromMembershipId, fu.id AS fromUserId, fu.name AS fromName, f.status AS fromStatus,
              t.id AS toMembershipId, tu.id AS toUserId, tu.name AS toName, t.status AS toStatus,
              (st.from_membership_id IN (${MINE})) AS iPaid
       FROM settlements st
       JOIN groups g ON g.id = st.group_id
       JOIN memberships f ON f.id = st.from_membership_id JOIN users fu ON fu.id = f.user_id
       JOIN memberships t ON t.id = st.to_membership_id JOIN users tu ON tu.id = t.user_id
       WHERE st.status = 'active' AND st.settlement_date BETWEEN :from AND :to
         AND (st.from_membership_id IN (${MINE}) OR st.to_membership_id IN (${MINE}))
       ORDER BY st.settlement_date DESC, st.id DESC`,
    )
    .all(params);

  const sum = (rows, pick) => rows.reduce((total, r) => total + (pick(r) ?? 0), 0);
  const ref = (membershipId, userId, name, status) => ({ membershipId, userId, name, status });

  return {
    period: { type: period, from, to, label: formatPeriodLabel(period, from, to) },
    groupId: groupId ?? null,
    totals: {
      paidPaise: sum(expenses, (e) => (e.iPaid ? e.amountPaise : 0)),
      mySharePaise: sum(expenses, (e) => e.mySharePaise),
      settlementsPaidPaise: sum(settlements, (s) => (s.iPaid ? s.amountPaise : 0)),
      settlementsReceivedPaise: sum(settlements, (s) => (s.iPaid ? 0 : s.amountPaise)),
    },
    expenses: expenses.map((e) => ({
      expenseId: e.expenseId,
      date: e.date,
      groupId: e.groupId,
      groupName: e.groupName,
      description: e.description,
      payer: ref(e.payerMembershipId, e.payerUserId, e.payerName, e.payerStatus),
      amountPaise: e.amountPaise,
      mySharePaise: e.mySharePaise ?? 0,
      splitMethod: e.splitMethod,
    })),
    settlements: settlements.map((s) => ({
      settlementId: s.settlementId,
      date: s.date,
      groupId: s.groupId,
      groupName: s.groupName,
      from: ref(s.fromMembershipId, s.fromUserId, s.fromName, s.fromStatus),
      to: ref(s.toMembershipId, s.toUserId, s.toName, s.toStatus),
      amountPaise: s.amountPaise,
      note: s.note,
    })),
  };
}
