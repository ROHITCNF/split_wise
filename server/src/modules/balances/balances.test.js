import { beforeAll, describe, expect, it } from 'vitest';
import { createTestContext } from '../../test/helpers.js';
import { seed } from '../../db/seed.js';
import { memberNet, nonZeroBalancesForUser, pairBalances } from './service.js';

// Expected values are worked out by hand from the seed data (db/seed.js).
let ctx;
const m = {}; // `${group}:${firstName}` → membership id
const groupIds = {};

beforeAll(async () => {
  ctx = createTestContext();
  await seed(ctx.sqlite);
  for (const row of ctx.sqlite
    .prepare(
      `SELECT g.id AS groupId, g.name AS groupName, m.id AS membershipId, u.name AS userName
       FROM memberships m JOIN groups g ON g.id = m.group_id JOIN users u ON u.id = m.user_id`,
    )
    .all()) {
    groupIds[row.groupName] = row.groupId;
    m[`${row.groupName}:${row.userName.split(' ')[0]}`] = row.membershipId;
  }
});

const pair = (group, from, to, amountPaise) => ({
  fromMembershipId: m[`${group}:${from}`],
  toMembershipId: m[`${group}:${to}`],
  amountPaise,
});

describe('pairBalances (FR-BAL-01)', () => {
  it('Trip Goa: shares, exact split and a settlement netted per pair', () => {
    // Dinner ₹1,200 (Priya; K 600 / P 300 / R 300), Scooter ₹1,500 (Karan; 500 each),
    // Groceries ₹450 (Ravi; 150 each), Water ₹60 (Karan only), Ravi paid Karan ₹300.
    // Karan–Priya: 600 − 500 = Karan owes 100. Karan–Ravi: 500 − 150 − 300 = Ravi owes 50.
    // Priya–Ravi: 300 − 150 = Ravi owes 150.
    expect(pairBalances(ctx, groupIds['Trip Goa'])).toEqual(
      expect.arrayContaining([
        pair('Trip Goa', 'Karan', 'Priya', 10000),
        pair('Trip Goa', 'Ravi', 'Karan', 5000),
        pair('Trip Goa', 'Ravi', 'Priya', 15000),
      ]),
    );
    expect(pairBalances(ctx, groupIds['Trip Goa'])).toHaveLength(3);
  });

  it('Flat 302: remainder paisa and partial settlement', () => {
    // Electricity ₹2,345.68 (Ananya; 781.89 / 781.90 / 781.89), Internet ₹999 (Priya; 333 each),
    // Karan paid Priya ₹200.
    expect(pairBalances(ctx, groupIds['Flat 302'])).toEqual(
      expect.arrayContaining([
        pair('Flat 302', 'Priya', 'Ananya', 78189 - 33300),
        pair('Flat 302', 'Karan', 'Ananya', 78189),
        pair('Flat 302', 'Karan', 'Priya', 33300 - 20000),
      ]),
    );
  });

  it('ignores soft-deleted expenses and settlements', () => {
    const groupId = groupIds['Trip Goa'];
    const run = ctx.sqlite.transaction(() => {
      ctx.sqlite
        .prepare(`UPDATE settlements SET status = 'deleted', deleted_at = 'x' WHERE group_id = ?`)
        .run(groupId);
      ctx.sqlite
        .prepare(
          `UPDATE expenses SET status = 'deleted', deleted_at = 'x' WHERE description = 'Groceries'`,
        )
        .run();
      // Karan–Ravi without the ₹300 payment and the groceries: Ravi owes 500.
      expect(pairBalances(ctx, groupId)).toContainEqual(pair('Trip Goa', 'Ravi', 'Karan', 50000));
      throw new Error('rollback');
    });
    expect(run).toThrow('rollback'); // undo so later tests see the seed unchanged
  });
});

describe('memberNet (zero-balance guard)', () => {
  it('nets sum to zero within a group', () => {
    const nets = ['Karan', 'Priya', 'Ravi'].map((n) =>
      memberNet(ctx, groupIds['Trip Goa'], m[`Trip Goa:${n}`]),
    );
    expect(nets).toEqual([-5000, 25000, -20000]);
    expect(nets.reduce((a, b) => a + b, 0)).toBe(0);
  });

  it('a member with no records is settled up', () => {
    expect(memberNet(ctx, groupIds['Trip Goa'], 999999)).toBe(0);
  });
});

describe('nonZeroBalancesForUser', () => {
  it('lists every group where the user is not settled', () => {
    const karan = ctx.sqlite
      .prepare(`SELECT id FROM users WHERE email = 'karan@example.com'`)
      .get().id;
    expect(nonZeroBalancesForUser(ctx, karan)).toEqual([
      { groupId: groupIds['Trip Goa'], groupName: 'Trip Goa', netPaise: -5000 },
      { groupId: groupIds['Flat 302'], groupName: 'Flat 302', netPaise: -(78189 + 13300) },
    ]);
  });
});
