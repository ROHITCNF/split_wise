import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { todayIST } from '@splitbook/shared';
import {
  createGroup,
  createTestApp,
  createUser,
  loginCookie,
  TEST_ORIGIN,
} from '../../test/helpers.js';
import { nowIso } from '../../lib/time.js';

let ctx, app, groupId, m, users, cookies;

beforeEach(() => {
  ({ ctx, app } = createTestApp());
  users = {
    karan: createUser(ctx, { name: 'Karan Mehta' }),
    priya: createUser(ctx, { name: 'Priya Sharma' }),
    ravi: createUser(ctx, { name: 'Ravi Kumar' }),
    ananya: createUser(ctx, { name: 'Ananya Iyer' }),
  };
  const g = createGroup(ctx, {
    name: 'Trip Goa',
    adminUserId: users.karan,
    memberUserIds: [users.priya, users.ravi],
  });
  groupId = g.groupId;
  m = Object.fromEntries(Object.entries(users).map(([k, id]) => [k, g.memberships[id]]));
  cookies = Object.fromEntries(Object.entries(users).map(([k, id]) => [k, loginCookie(ctx, id)]));
});

const as = (who) => ({
  get: (url) => request(app).get(url).set('Cookie', cookies[who]),
  send: (method, url, body) =>
    request(app)[method](url).set('Origin', TEST_ORIGIN).set('Cookie', cookies[who]).send(body),
});
const base = () => `/api/groups/${groupId}`;
const all = (sql, ...args) => ctx.sqlite.prepare(sql).all(...args);
const one = (sql, ...args) => ctx.sqlite.prepare(sql).get(...args);

const dinner = (overrides = {}) => ({
  description: 'Dinner at Thalassa',
  notes: 'Includes tip',
  amountPaise: 120000,
  expenseDate: '2026-09-30',
  payerMembershipId: m.priya,
  splitMethod: 'percentage',
  participants: [
    { membershipId: m.karan, valueBp: 5000 },
    { membershipId: m.priya, valueBp: 2500 },
    { membershipId: m.ravi, valueBp: 2500 },
  ],
  ...overrides,
});

async function create(who, body) {
  const res = await as(who).send('post', `${base()}/expenses`, body);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body;
}

function settle(from, to, amount) {
  const now = nowIso();
  ctx.sqlite
    .prepare(
      `INSERT INTO settlements (group_id, from_membership_id, to_membership_id, amount_paise,
         settlement_date, recorded_by_membership_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, '2026-09-30', ?, ?, ?)`,
    )
    .run(groupId, from, to, amount, from, now, now);
}

function leave(membershipId) {
  ctx.sqlite
    .prepare(`UPDATE memberships SET status = 'left', ended_at = ? WHERE id = ?`)
    .run(nowIso(), membershipId);
}

describe('E2 create', () => {
  it('percentage split → shares, myShare, permissions', async () => {
    const e = await create('priya', dinner());
    expect(e).toMatchObject({
      description: 'Dinner at Thalassa',
      amountPaise: 120000,
      splitMethod: 'percentage',
      payer: { membershipId: m.priya, name: 'Priya Sharma', status: 'active' },
      createdBy: { membershipId: m.priya },
      myShare: { sharePaise: 30000 },
      status: 'active',
      permissions: { canEdit: true, canDelete: true, frozenReason: null },
    });
    expect(e.shares.map((s) => [s.member.name, s.sharePaise, s.inputBp, s.position])).toEqual([
      ['Karan Mehta', 60000, 5000, 0],
      ['Priya Sharma', 30000, 2500, 1],
      ['Ravi Kumar', 30000, 2500, 2],
    ]);
  });

  it('E1: equal split remainder goes to the payer', async () => {
    const e = await create(
      'karan',
      dinner({
        amountPaise: 10000,
        payerMembershipId: m.ravi,
        splitMethod: 'equal',
        participants: [
          { membershipId: m.karan },
          { membershipId: m.priya },
          { membershipId: m.ravi },
        ],
      }),
    );
    expect(e.shares.map((s) => s.sharePaise)).toEqual([3333, 3333, 3334]);
  });

  it('E7: payer as only participant is allowed', async () => {
    const e = await create(
      'karan',
      dinner({
        amountPaise: 6000,
        payerMembershipId: m.karan,
        splitMethod: 'equal',
        participants: [{ membershipId: m.karan }],
      }),
    );
    expect(e.myShare).toEqual({ sharePaise: 6000 });
  });

  it('writes change record, activity and notifications (payer + participants − actor)', async () => {
    const e = await create('priya', dinner());
    expect(
      one(`SELECT action, after_json FROM change_records WHERE entity_id = ?`, e.expenseId),
    ).toMatchObject({
      action: 'created',
    });
    expect(one(`SELECT summary FROM activity_events WHERE type = 'expense_created'`).summary).toBe(
      "Priya added 'Dinner at Thalassa' ₹1,200.00",
    );
    expect(all(`SELECT recipient_user_id AS r, message FROM notifications ORDER BY r`)).toEqual([
      { r: users.karan, message: "Priya added 'Dinner at Thalassa' — your share ₹600.00" },
      { r: users.ravi, message: "Priya added 'Dinner at Thalassa' — your share ₹300.00" },
    ]);
  });

  it.each([
    [
      'E3/E4 exact sum mismatch',
      { splitMethod: 'exact', participants: [{ membershipId: 0, valuePaise: 50000 }] },
      400,
      'SPLIT_SUM_MISMATCH',
    ],
    [
      'E5 percent ≠ 100',
      { participants: [{ membershipId: 0, valueBp: 9000 }] },
      400,
      'PERCENT_SUM_MISMATCH',
    ],
    ['E23 future date', { expenseDate: '2999-01-01' }, 400, 'FUTURE_DATE'],
    ['E24 description > 100', { description: 'x'.repeat(101) }, 400, 'VALIDATION_ERROR'],
  ])('%s', async (_label, overrides, status, code) => {
    const body = dinner(overrides);
    body.participants = body.participants.map((p) =>
      p.membershipId === 0 ? { ...p, membershipId: m.karan } : p,
    );
    const res = await as('karan').send('post', `${base()}/expenses`, body);
    expect(res.status).toBe(status);
    expect(res.body.error.code).toBe(code);
  });

  it('exact mismatch reports the difference', async () => {
    const res = await as('karan').send(
      'post',
      `${base()}/expenses`,
      dinner({
        splitMethod: 'exact',
        participants: [
          { membershipId: m.karan, valuePaise: 50000 },
          { membershipId: m.priya, valuePaise: 60000 },
        ],
      }),
    );
    expect(res.body.error.details).toEqual({ differencePaise: 10000 });
  });

  it('E20b: payer not an active member → 409 PAYER_NOT_ACTIVE', async () => {
    leave(m.ravi);
    const res = await as('karan').send(
      'post',
      `${base()}/expenses`,
      dinner({ payerMembershipId: m.ravi }),
    );
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PAYER_NOT_ACTIVE');
  });

  it('participant not active (or from another group) → 409 PARTICIPANT_NOT_ACTIVE', async () => {
    const other = createGroup(ctx, { adminUserId: users.ananya, memberUserIds: [users.karan] });
    const res = await as('karan').send(
      'post',
      `${base()}/expenses`,
      dinner({
        participants: [
          { membershipId: m.karan, valueBp: 5000 },
          { membershipId: other.memberships[users.ananya], valueBp: 5000 },
        ],
      }),
    );
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: 'PARTICIPANT_NOT_ACTIVE',
      details: { membershipIds: [other.memberships[users.ananya]] },
    });
  });

  it('non-member → 404', async () => {
    expect((await as('ananya').send('post', `${base()}/expenses`, dinner())).status).toBe(404);
  });
});

describe('E1 list', () => {
  beforeEach(async () => {
    await create('priya', dinner());
    await create(
      'karan',
      dinner({
        description: 'Scooter rental 100%_off',
        notes: null,
        amountPaise: 150000,
        expenseDate: '2026-09-29',
        payerMembershipId: m.karan,
        splitMethod: 'equal',
        participants: [{ membershipId: m.karan }, { membershipId: m.priya }],
      }),
    );
    await create(
      'karan',
      dinner({
        description: 'Water',
        notes: 'from the shop',
        amountPaise: 6000,
        expenseDate: todayIST(),
        payerMembershipId: m.karan,
        splitMethod: 'equal',
        participants: [{ membershipId: m.karan }],
      }),
    );
  });

  it('newest date first, without shares, with myShare', async () => {
    const res = await as('ravi').get(`${base()}/expenses`);
    expect(res.body).toMatchObject({ page: 1, pageSize: 20, total: 3 });
    expect(res.body.items.map((e) => [e.description, e.myShare])).toEqual([
      ['Water', null],
      ['Dinner at Thalassa', { sharePaise: 30000 }],
      ['Scooter rental 100%_off', null],
    ]);
    expect(res.body.items[0].shares).toBeUndefined();
  });

  it('searches description and notes, literal % and _', async () => {
    const q = async (s) =>
      (await as('karan').get(`${base()}/expenses?q=${encodeURIComponent(s)}`)).body.items.map(
        (e) => e.description,
      );
    expect(await q('shop')).toEqual(['Water']);
    expect(await q('TIP')).toEqual(['Dinner at Thalassa']);
    expect(await q('%_')).toEqual(['Scooter rental 100%_off']);
  });

  it('filters by date and amount; paginates', async () => {
    expect((await as('karan').get(`${base()}/expenses?date=2026-09-29`)).body.items).toHaveLength(
      1,
    );
    expect(
      (await as('karan').get(`${base()}/expenses?amountPaise=120000`)).body.items[0].description,
    ).toBe('Dinner at Thalassa');
    const page2 = await as('karan').get(`${base()}/expenses?page=2&pageSize=2`);
    expect(page2.body).toMatchObject({ page: 2, pageSize: 2, total: 3 });
    expect(page2.body.items).toHaveLength(1);
  });

  it('deleted expenses are not listed', async () => {
    const id = one(`SELECT id FROM expenses WHERE description = 'Water'`).id;
    await as('karan').send('delete', `${base()}/expenses/${id}`);
    expect((await as('karan').get(`${base()}/expenses`)).body.total).toBe(2);
  });
});

describe('E3 detail / permissions', () => {
  it('creator and admin may edit; others may not', async () => {
    const e = await create('priya', dinner());
    const perm = async (who) =>
      (await as(who).get(`${base()}/expenses/${e.expenseId}`)).body.permissions;
    expect(await perm('priya')).toMatchObject({ canEdit: true });
    expect(await perm('karan')).toMatchObject({ canEdit: true }); // admin
    expect(await perm('ravi')).toMatchObject({ canEdit: false, frozenReason: null });
  });

  it('E27: frozen when someone involved has left', async () => {
    const e = await create('priya', dinner());
    leave(m.ravi);
    const res = await as('priya').get(`${base()}/expenses/${e.expenseId}`);
    expect(res.body.permissions).toEqual({
      canEdit: false,
      canDelete: false,
      frozenReason: 'INVOLVES_DEPARTED_MEMBER',
    });
    expect(res.body.shares[2].member).toMatchObject({ name: 'Ravi Kumar', status: 'left' });
  });

  it('expense of another group → 404', async () => {
    const other = createGroup(ctx, { adminUserId: users.karan, memberUserIds: [users.ananya] });
    const res = await as('karan').send(
      'post',
      `/api/groups/${other.groupId}/expenses`,
      dinner({
        payerMembershipId: other.memberships[users.karan],
        splitMethod: 'equal',
        participants: [{ membershipId: other.memberships[users.karan] }],
      }),
    );
    expect((await as('karan').get(`${base()}/expenses/${res.body.expenseId}`)).status).toBe(404);
  });
});

describe('E4 edit', () => {
  let e;
  beforeEach(async () => {
    e = await create('priya', dinner());
  });
  const edit = (who, body) => as(who).send('put', `${base()}/expenses/${e.expenseId}`, body);

  it('creator edits; history stores before/after; last editor recorded', async () => {
    const res = await edit('priya', dinner({ amountPaise: 100000 }));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ amountPaise: 100000, updatedBy: { membershipId: m.priya } });
    expect(res.body.shares.map((s) => s.sharePaise)).toEqual([50000, 25000, 25000]);

    const history = (await as('ravi').get(`${base()}/expenses/${e.expenseId}/history`)).body.items;
    expect(history.map((h) => h.action)).toEqual(['created', 'updated']);
    expect(history[1].before.amountPaise).toBe(120000);
    expect(history[1].after.amountPaise).toBe(100000);
    expect(history[1].actor.name).toBe('Priya Sharma');
    expect(one(`SELECT summary FROM activity_events WHERE type = 'expense_updated'`).summary).toBe(
      "Priya edited 'Dinner at Thalassa' ₹1,200.00 → ₹1,000.00",
    );
  });

  it('admin may edit; other member → 403', async () => {
    expect((await edit('karan', dinner({ description: 'Dinner' }))).status).toBe(200);
    expect((await edit('ravi', dinner())).status).toBe(403);
  });

  it('E9: split method locked', async () => {
    const res = await edit(
      'priya',
      dinner({ splitMethod: 'equal', participants: [{ membershipId: m.karan }] }),
    );
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SPLIT_METHOD_LOCKED');
  });

  it('E10 / API-2 / API-5: remove and add participants, change payer; dropped people notified', async () => {
    ctx.sqlite.prepare('DELETE FROM notifications').run();
    const res = await edit(
      'priya',
      dinner({
        payerMembershipId: m.karan,
        participants: [
          { membershipId: m.karan, valueBp: 5000 },
          { membershipId: m.priya, valueBp: 5000 },
        ],
      }),
    );
    expect(res.status).toBe(200);
    expect(res.body.payer.membershipId).toBe(m.karan);
    expect(res.body.shares.map((s) => s.member.membershipId)).toEqual([m.karan, m.priya]);
    expect(
      one(`SELECT message FROM notifications WHERE recipient_user_id = ?`, users.ravi).message,
    ).toBe("Priya edited 'Dinner at Thalassa' — you're no longer part of it");
  });

  it('adding a participant who has left → 409 PARTICIPANT_NOT_ACTIVE', async () => {
    const pastMembership = Number(
      ctx.sqlite
        .prepare(
          `INSERT INTO memberships (group_id, user_id, role, status, joined_at, ended_at)
           VALUES (?, ?, 'member', 'left', ?, ?)`,
        )
        .run(groupId, users.ananya, nowIso(), nowIso()).lastInsertRowid,
    );
    const res = await edit(
      'priya',
      dinner({
        participants: [
          { membershipId: m.karan, valueBp: 5000 },
          { membershipId: m.priya, valueBp: 2500 },
          { membershipId: pastMembership, valueBp: 2500 },
        ],
      }),
    );
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: 'PARTICIPANT_NOT_ACTIVE',
      details: { membershipIds: [pastMembership] },
    });
  });

  it('E8: settlement since creation → confirmation, then saved', async () => {
    settle(m.ravi, m.priya, 30000);
    // make sure the settlement is strictly newer than the expense
    ctx.sqlite.prepare(`UPDATE settlements SET created_at = '2999-01-01T00:00:00.000Z'`).run();
    const first = await edit('priya', dinner({ amountPaise: 90000 }));
    expect(first.status).toBe(409);
    expect(first.body.error).toMatchObject({
      code: 'CONFIRMATION_REQUIRED',
      details: { reason: 'SETTLEMENT_EXISTS', settlementCount: 1 },
    });
    expect(one('SELECT amount_paise AS a FROM expenses').a).toBe(120000);

    const confirmed = await edit('priya', dinner({ amountPaise: 90000, confirm: true }));
    expect(confirmed.status).toBe(200);
  });

  it('settlements between unrelated people do not warn', async () => {
    const other = createUser(ctx, { name: 'Other' });
    const otherMembership = Number(
      ctx.sqlite
        .prepare(
          `INSERT INTO memberships (group_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)`,
        )
        .run(groupId, other, nowIso()).lastInsertRowid,
    );
    settle(otherMembership, m.karan, 100);
    ctx.sqlite.prepare(`UPDATE settlements SET created_at = '2999-01-01T00:00:00.000Z'`).run();
    expect((await edit('priya', dinner({ amountPaise: 90000 }))).status).toBe(200);
  });

  it('E11: concurrent edits — last write wins, both kept in history', async () => {
    await edit('priya', dinner({ description: 'First' }));
    await edit('karan', dinner({ description: 'Second' }));
    expect(one('SELECT description FROM expenses').description).toBe('Second');
    expect(one(`SELECT COUNT(*) AS n FROM change_records WHERE action = 'updated'`).n).toBe(2);
  });
});

describe('E5 delete', () => {
  it('soft delete; still viewable; balances ignore it; second delete → 409', async () => {
    const e = await create('priya', dinner());
    expect((await as('ravi').send('delete', `${base()}/expenses/${e.expenseId}`)).status).toBe(403);
    expect((await as('priya').send('delete', `${base()}/expenses/${e.expenseId}`)).status).toBe(
      204,
    );

    const detail = await as('ravi').get(`${base()}/expenses/${e.expenseId}`);
    expect(detail.body).toMatchObject({ status: 'deleted', permissions: { canEdit: false } });
    expect((await as('karan').get(`${base()}/balances`)).body.pairs).toEqual([]);

    const again = await as('priya').send('delete', `${base()}/expenses/${e.expenseId}`);
    expect(again.body.error.code).toBe('EXPENSE_DELETED');
    expect(
      (await as('priya').send('put', `${base()}/expenses/${e.expenseId}`, dinner())).body.error
        .code,
    ).toBe('EXPENSE_DELETED');
  });

  it('E27: frozen expense cannot be deleted', async () => {
    const e = await create('priya', dinner());
    leave(m.ravi);
    const res = await as('priya').send('delete', `${base()}/expenses/${e.expenseId}`);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: 'INVOLVES_DEPARTED_MEMBER',
      details: { membershipIds: [m.ravi] },
    });
  });
});

describe('B1 balances / B2 breakdown', () => {
  beforeEach(async () => {
    await create('priya', dinner()); // Karan owes Priya 600, Ravi owes Priya 300
    await create(
      'karan',
      dinner({
        description: 'Scooter',
        amountPaise: 150000,
        payerMembershipId: m.karan,
        splitMethod: 'equal',
        participants: [
          { membershipId: m.karan },
          { membershipId: m.priya },
          { membershipId: m.ravi },
        ],
      }),
    ); // Priya owes Karan 500, Ravi owes Karan 500
    settle(m.ravi, m.karan, 30000);
  });

  it('pairwise netted lines and my position', async () => {
    const res = await as('karan').get(`${base()}/balances`);
    const line = (p) => [p.from.name.split(' ')[0], p.to.name.split(' ')[0], p.amountPaise];
    expect(res.body.pairs.map(line)).toEqual(
      expect.arrayContaining([
        ['Karan', 'Priya', 10000],
        ['Ravi', 'Karan', 20000],
        ['Ravi', 'Priya', 30000],
      ]),
    );
    expect(res.body.me.netPaise).toBe(10000);
    expect(res.body.me.youOwe.map((x) => [x.to.name, x.amountPaise])).toEqual([
      ['Priya Sharma', 10000],
    ]);
    expect(res.body.me.owesYou.map((x) => [x.from.name, x.amountPaise])).toEqual([
      ['Ravi Kumar', 20000],
    ]);
  });

  it('breakdown explains a pair, oriented as "from owes to"', async () => {
    const res = await as('priya').get(`${base()}/balances/breakdown?a=${m.karan}&b=${m.ravi}`);
    expect(res.body).toMatchObject({
      netPaise: 20000,
      from: { name: 'Ravi Kumar' },
      to: { name: 'Karan Mehta' },
    });
    expect(res.body.items.map((i) => [i.kind, i.effectPaise, i.paidBy.name])).toEqual(
      expect.arrayContaining([
        ['expense', 50000, 'Karan Mehta'],
        ['settlement', -30000, 'Ravi Kumar'],
      ]),
    );
    expect(res.body.items.reduce((t, i) => t + i.effectPaise, 0)).toBe(20000);
  });

  it('breakdown with a membership from another group → 404', async () => {
    expect(
      (await as('karan').get(`${base()}/balances/breakdown?a=${m.karan}&b=99999`)).status,
    ).toBe(404);
  });

  it('non-member → 404', async () => {
    expect((await as('ananya').get(`${base()}/balances`)).status).toBe(404);
  });
});

describe('D1 dashboard', () => {
  it('totals across groups, groups with nets, latest activity', async () => {
    await create('priya', dinner());
    const flat = createGroup(ctx, {
      name: 'Flat 302',
      adminUserId: users.ananya,
      memberUserIds: [users.karan],
    });
    await as('ananya').send(
      'post',
      `/api/groups/${flat.groupId}/expenses`,
      dinner({
        description: 'Rent',
        amountPaise: 20000,
        payerMembershipId: flat.memberships[users.karan],
        splitMethod: 'equal',
        participants: [
          { membershipId: flat.memberships[users.ananya] },
          { membershipId: flat.memberships[users.karan] },
        ],
      }),
    );

    const res = await as('karan').get('/api/dashboard');
    expect(res.body.totals).toEqual({
      youOwePaise: 60000,
      owedToYouPaise: 10000,
      netPaise: -50000,
    });
    expect(res.body.groups.map((g) => [g.name, g.netPaise])).toEqual(
      expect.arrayContaining([
        ['Trip Goa', -60000],
        ['Flat 302', 10000],
      ]),
    );
    expect(res.body.recentActivity[0]).toMatchObject({
      groupName: 'Flat 302',
      type: 'expense_created',
    });
  });

  it('activity of groups I left is not shown', async () => {
    await create('priya', dinner({ participants: [{ membershipId: m.priya, valueBp: 10000 }] }));
    leave(m.ravi);
    expect((await as('ravi').get('/api/dashboard')).body.recentActivity).toEqual([]);
  });
});
