// Balances are derived on every read, never stored (ADR-004, DATABASE_SCHEMA §6.1–6.2).
// Every active share is a debt participant → payer; every active settlement from → to
// is a debt to → from that cancels it. Each pair is then netted.

const DEBTS_CTE = `
  WITH debts AS (
    SELECT s.membership_id AS debtor, e.payer_membership_id AS creditor, s.share_paise AS amt
    FROM expenses e JOIN expense_shares s ON s.expense_id = e.id
    WHERE e.group_id = :groupId AND e.status = 'active'
      AND s.membership_id <> e.payer_membership_id
    UNION ALL
    SELECT st.to_membership_id, st.from_membership_id, st.amount_paise
    FROM settlements st
    WHERE st.group_id = :groupId AND st.status = 'active'
  )`;

/**
 * Pairwise netted balances of a group. `fromMembershipId` owes `toMembershipId`.
 * Zero pairs are omitted.
 * @returns {{ fromMembershipId: number, toMembershipId: number, amountPaise: number }[]}
 */
export function pairBalances(ctx, groupId) {
  const rows = ctx.sqlite
    .prepare(
      `${DEBTS_CTE},
       pairs AS (
         SELECT min(debtor, creditor) AS a, max(debtor, creditor) AS b,
                SUM(CASE WHEN debtor < creditor THEN amt ELSE -amt END) AS a_owes_b
         FROM debts GROUP BY 1, 2
       )
       SELECT a, b, a_owes_b FROM pairs WHERE a_owes_b <> 0 ORDER BY a, b`,
    )
    .all({ groupId });
  return rows.map(({ a, b, a_owes_b }) =>
    a_owes_b > 0
      ? { fromMembershipId: a, toMembershipId: b, amountPaise: a_owes_b }
      : { fromMembershipId: b, toMembershipId: a, amountPaise: -a_owes_b },
  );
}

/**
 * Net position of one membership in its group: > 0 others owe them, < 0 they owe,
 * 0 settled up. Used by the zero-balance guard (DOMAIN §4.3).
 */
export function memberNet(ctx, groupId, membershipId) {
  return ctx.sqlite
    .prepare(
      `${DEBTS_CTE}
       SELECT COALESCE(SUM(CASE WHEN creditor = :m THEN amt WHEN debtor = :m THEN -amt ELSE 0 END), 0) AS net
       FROM debts`,
    )
    .get({ groupId, m: membershipId }).net;
}

/**
 * Every group where the user's active membership has a non-zero balance
 * (account deletion guard, FR-AUTH-08).
 * @returns {{ groupId: number, groupName: string, netPaise: number }[]}
 */
export function nonZeroBalancesForUser(ctx, userId) {
  const active = ctx.sqlite
    .prepare(
      `SELECT m.id AS membershipId, g.id AS groupId, g.name AS groupName
       FROM memberships m JOIN groups g ON g.id = m.group_id
       WHERE m.user_id = ? AND m.status = 'active'
       ORDER BY g.id`,
    )
    .all(userId);
  return active
    .map(({ membershipId, groupId, groupName }) => ({
      groupId,
      groupName,
      netPaise: memberNet(ctx, groupId, membershipId),
    }))
    .filter((row) => row.netPaise !== 0);
}

/**
 * B1 — pairwise lines plus the caller's own position (FR-BAL-01..03).
 * `toRef(membershipId)` turns IDs into MemberRefs.
 */
export function groupBalances(ctx, groupId, myMembershipId, toRef) {
  const pairs = pairBalances(ctx, groupId);
  const youOwe = pairs
    .filter((p) => p.fromMembershipId === myMembershipId)
    .map((p) => ({ to: toRef(p.toMembershipId), amountPaise: p.amountPaise }));
  const owesYou = pairs
    .filter((p) => p.toMembershipId === myMembershipId)
    .map((p) => ({ from: toRef(p.fromMembershipId), amountPaise: p.amountPaise }));
  const sum = (rows) => rows.reduce((total, r) => total + r.amountPaise, 0);
  return {
    pairs: pairs.map((p) => ({
      from: toRef(p.fromMembershipId),
      to: toRef(p.toMembershipId),
      amountPaise: p.amountPaise,
    })),
    me: { netPaise: sum(owesYou) - sum(youOwe), youOwe, owesYou },
  };
}

/**
 * B2 — the expenses and settlements that make up the balance between two
 * memberships (FR-BAL-05). `effectPaise` is the change to "from owes to".
 */
export function pairBreakdown(ctx, groupId, a, b) {
  const expenseRows = ctx.sqlite
    .prepare(
      `SELECT e.id, e.expense_date AS date, e.description, e.payer_membership_id AS payer,
              s.share_paise AS share
       FROM expenses e JOIN expense_shares s ON s.expense_id = e.id
       WHERE e.group_id = :groupId AND e.status = 'active'
         AND ((e.payer_membership_id = :a AND s.membership_id = :b)
           OR (e.payer_membership_id = :b AND s.membership_id = :a))`,
    )
    .all({ groupId, a, b });
  const settlementRows = ctx.sqlite
    .prepare(
      `SELECT id, settlement_date AS date, note, from_membership_id AS payer, amount_paise AS amount
       FROM settlements
       WHERE group_id = :groupId AND status = 'active'
         AND ((from_membership_id = :a AND to_membership_id = :b)
           OR (from_membership_id = :b AND to_membership_id = :a))`,
    )
    .all({ groupId, a, b });

  // Effects on "a owes b": b paid for a → +, a paid for b → −; a paid b back → −.
  const items = [
    ...expenseRows.map((r) => ({
      kind: 'expense',
      id: r.id,
      date: r.date,
      description: r.description,
      paidBy: r.payer,
      aOwesB: r.payer === b ? r.share : -r.share,
    })),
    ...settlementRows.map((r) => ({
      kind: 'settlement',
      id: r.id,
      date: r.date,
      note: r.note,
      paidBy: r.payer,
      aOwesB: r.payer === a ? -r.amount : r.amount,
    })),
  ].sort((x, y) => (x.date === y.date ? y.id - x.id : x.date < y.date ? 1 : -1));

  const net = items.reduce((total, i) => total + i.aOwesB, 0);
  const flip = net < 0;
  return {
    fromMembershipId: flip ? b : a,
    toMembershipId: flip ? a : b,
    netPaise: Math.abs(net),
    items: items.map(({ aOwesB, ...item }) => ({ ...item, effectPaise: flip ? -aOwesB : aOwesB })),
  };
}

/** Totals across all of a user's active groups (FR-BAL-04, FR-DSH-01). */
export function overallTotals(ctx, activeMemberships) {
  let youOwePaise = 0;
  let owedToYouPaise = 0;
  for (const { groupId, membershipId } of activeMemberships) {
    for (const p of pairBalances(ctx, groupId)) {
      if (p.fromMembershipId === membershipId) youOwePaise += p.amountPaise;
      if (p.toMembershipId === membershipId) owedToYouPaise += p.amountPaise;
    }
  }
  return { youOwePaise, owedToYouPaise, netPaise: owedToYouPaise - youOwePaise };
}
