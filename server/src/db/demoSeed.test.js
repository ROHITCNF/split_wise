import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApp, createTestContext, loginCookie } from '../test/helpers.js';
import { memberNet, pairBalances } from '../modules/balances/service.js';
import { nowIso } from '../lib/time.js';
import { seed } from './seed.js';
import { seedDemo } from './demoSeed.js';

// Guards `npm run db:demo`: the demo must load cleanly on top of the base seed and
// leave the database in a state every screen can handle.
let ctx;
const all = (sql, ...args) => ctx.sqlite.prepare(sql).all(...args);
const one = (sql, ...args) => ctx.sqlite.prepare(sql).get(...args);

beforeAll(async () => {
  ctx = createTestContext();
  await seed(ctx.sqlite);
  await seedDemo(ctx);
});

describe('demo seed', () => {
  it('adds users and groups on top of the base seed', () => {
    expect(one('SELECT COUNT(*) AS n FROM users').n).toBe(10);
    expect(all('SELECT name FROM groups ORDER BY id').map((g) => g.name)).toEqual([
      'Trip Goa',
      'Flat 302',
      'Flatmates – Koramangala',
      'Office Lunch Club',
      'Manali Trip 2026',
      'Weekend Cricket',
      "Mom's Birthday Gift",
    ]);
  });

  it('every active expense: shares sum to the amount, one "created" record', () => {
    const rows = all(
      `SELECT e.id, e.amount_paise AS amount,
              (SELECT SUM(share_paise) FROM expense_shares WHERE expense_id = e.id) AS shares,
              (SELECT COUNT(*) FROM change_records WHERE entity_type = 'expense' AND entity_id = e.id AND action = 'created') AS created
       FROM expenses e`,
    );
    expect(rows.length).toBeGreaterThan(50);
    for (const r of rows) {
      expect(r.shares).toBe(r.amount);
      expect(r.created).toBe(1);
    }
  });

  it('every group has exactly one active admin and nets sum to zero', () => {
    for (const { id } of all('SELECT id FROM groups')) {
      expect(
        one(
          `SELECT COUNT(*) AS n FROM memberships WHERE group_id = ? AND role = 'admin' AND status = 'active'`,
          id,
        ).n,
      ).toBe(1);
      const members = all(`SELECT id FROM memberships WHERE group_id = ?`, id);
      expect(members.reduce((t, m) => t + memberNet(ctx, id, m.id), 0)).toBe(0);
    }
  });

  it('covers the interesting states the screens show', () => {
    expect(
      all('SELECT DISTINCT split_method AS m FROM expenses ORDER BY m').map((r) => r.m),
    ).toEqual(['equal', 'exact', 'percentage']);
    expect(one(`SELECT COUNT(*) AS n FROM expenses WHERE status = 'deleted'`).n).toBe(1);
    expect(
      one(`SELECT COUNT(*) AS n FROM change_records WHERE action = 'updated'`).n,
    ).toBeGreaterThan(0);
    // Rohan left Manali after settling up, so his membership there is zero and "(left)".
    const left = one(
      `SELECT m.id, m.group_id AS g FROM memberships m JOIN users u ON u.id = m.user_id
       WHERE u.email = 'rohan@example.com' AND m.status = 'left'`,
    );
    expect(memberNet(ctx, left.g, left.id)).toBe(0);
    // A fully settled group.
    const gift = one(`SELECT id FROM groups WHERE name = ?`, "Mom's Birthday Gift").id;
    expect(pairBalances(ctx, gift)).toEqual([]);
  });

  it('timestamps are in the past and expense dates are not in the future', () => {
    const now = nowIso();
    for (const table of [
      'expenses',
      'settlements',
      'activity_events',
      'notifications',
      'change_records',
    ]) {
      expect(one(`SELECT MAX(created_at) AS t FROM ${table}`).t <= now, table).toBe(true);
    }
    const today = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
    expect(one('SELECT MAX(expense_date) AS d FROM expenses').d <= today).toBe(true);
  });

  it('Karan has recent unread notifications and a populated dashboard and reports', async () => {
    const karan = one(`SELECT id FROM users WHERE email = 'karan@example.com'`).id;
    const { app } = createTestApp(ctx);
    const cookie = loginCookie(ctx, karan);

    const count = await request(app).get('/api/notifications/unread-count').set('Cookie', cookie);
    expect(count.body.count).toBeGreaterThan(0);

    const dashboard = await request(app).get('/api/dashboard').set('Cookie', cookie);
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.groups).toHaveLength(7); // Karan is in every group
    expect(dashboard.body.recentActivity).toHaveLength(10);

    const month = await request(app).get('/api/reports?period=month').set('Cookie', cookie);
    expect(month.body.expenses.length).toBeGreaterThan(0);
  });
});
