import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  createGroup,
  createTestApp,
  createUser,
  loginCookie,
  TEST_ORIGIN,
} from '../../test/helpers.js';
import { nowIso } from '../../lib/time.js';

let ctx, app, groupId, m, users, cookies;

beforeEach(async () => {
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

  // Karan owes Priya ₹700 (Priya paid ₹1,400 split with Karan).
  await as('priya').send('post', `${base()}/expenses`, {
    description: 'Cab',
    amountPaise: 140000,
    expenseDate: '2026-09-30',
    payerMembershipId: m.priya,
    splitMethod: 'equal',
    participants: [{ membershipId: m.karan }, { membershipId: m.priya }],
  });
  ctx.sqlite.prepare('DELETE FROM notifications').run();
});

const as = (who) => ({
  get: (url) => request(app).get(url).set('Cookie', cookies[who]),
  send: (method, url, body) =>
    request(app)[method](url).set('Origin', TEST_ORIGIN).set('Cookie', cookies[who]).send(body),
});
const base = () => `/api/groups/${groupId}`;
const one = (sql, ...args) => ctx.sqlite.prepare(sql).get(...args);
const all = (sql, ...args) => ctx.sqlite.prepare(sql).all(...args);

const payment = (overrides = {}) => ({
  fromMembershipId: m.karan,
  toMembershipId: m.priya,
  amountPaise: 70000,
  settlementDate: '2026-10-01',
  note: 'UPI',
  ...overrides,
});
const myNet = async (who) => (await as(who).get(`${base()}/balances`)).body.me.netPaise;

describe('S2 record settlement', () => {
  it('full settle-up brings the pair to zero; other party notified', async () => {
    const res = await as('karan').send('post', `${base()}/settlements`, payment());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      from: { name: 'Karan Mehta' },
      to: { name: 'Priya Sharma' },
      amountPaise: 70000,
      note: 'UPI',
      recordedBy: { membershipId: m.karan },
      permissions: { canEdit: true, canDelete: true, frozenReason: null },
    });
    expect(await myNet('karan')).toBe(0);
    expect(all('SELECT recipient_user_id AS r, message FROM notifications')).toEqual([
      { r: users.priya, message: 'Karan recorded a payment of ₹700.00 to you' },
    ]);
    expect(
      one(`SELECT summary FROM activity_events WHERE type = 'settlement_created'`).summary,
    ).toBe('Karan paid Priya ₹700.00');
  });

  it('receiver can record it too (FR-STL-01)', async () => {
    const res = await as('priya').send('post', `${base()}/settlements`, payment());
    expect(res.status).toBe(201);
    expect(one('SELECT message FROM notifications').message).toBe(
      'Priya recorded that you paid ₹700.00',
    );
  });

  it('FR-STL-02: partial payments allowed', async () => {
    await as('karan').send('post', `${base()}/settlements`, payment({ amountPaise: 20000 }));
    expect(await myNet('karan')).toBe(-50000);
  });

  it('E12: over-payment needs confirmation, then reverses the balance', async () => {
    const first = await as('karan').send(
      'post',
      `${base()}/settlements`,
      payment({ amountPaise: 100000 }),
    );
    expect(first.status).toBe(409);
    expect(first.body.error).toMatchObject({
      code: 'CONFIRMATION_REQUIRED',
      details: { reason: 'OVERPAYMENT', owedPaise: 70000, amountPaise: 100000 },
    });
    expect(one('SELECT COUNT(*) AS n FROM settlements').n).toBe(0);

    await as('karan').send(
      'post',
      `${base()}/settlements`,
      payment({ amountPaise: 100000, confirm: true }),
    );
    expect(await myNet('karan')).toBe(30000);
  });

  it('paying someone you owe nothing counts as over-payment (owed shown as 0)', async () => {
    const res = await as('karan').send(
      'post',
      `${base()}/settlements`,
      payment({ toMembershipId: m.ravi }),
    );
    expect(res.body.error.details).toMatchObject({ reason: 'OVERPAYMENT', owedPaise: 0 });
  });

  it('caller must be a party → 403 NOT_SETTLEMENT_PARTY', async () => {
    const res = await as('ravi').send('post', `${base()}/settlements`, payment());
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_SETTLEMENT_PARTY');
  });

  it('from = to → 400 SAME_PARTY', async () => {
    const res = await as('karan').send(
      'post',
      `${base()}/settlements`,
      payment({ toMembershipId: m.karan }),
    );
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SAME_PARTY');
  });

  it('E13: amount must be > 0; future date blocked', async () => {
    expect(
      (await as('karan').send('post', `${base()}/settlements`, payment({ amountPaise: 0 }))).status,
    ).toBe(400);
    const future = await as('karan').send(
      'post',
      `${base()}/settlements`,
      payment({ settlementDate: '2999-01-01' }),
    );
    expect(future.body.error.code).toBe('FUTURE_DATE');
  });

  it('party who has left → 409 PARTICIPANT_NOT_ACTIVE', async () => {
    ctx.sqlite
      .prepare(`UPDATE memberships SET status = 'left', ended_at = ? WHERE id = ?`)
      .run(nowIso(), m.ravi);
    const res = await as('karan').send(
      'post',
      `${base()}/settlements`,
      payment({ toMembershipId: m.ravi, confirm: true }),
    );
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PARTICIPANT_NOT_ACTIVE');
  });

  it('E14: duplicates are not detected', async () => {
    await as('karan').send('post', `${base()}/settlements`, payment({ amountPaise: 10000 }));
    expect(
      (await as('priya').send('post', `${base()}/settlements`, payment({ amountPaise: 10000 })))
        .status,
    ).toBe(201);
  });
});

describe('S1/S3/S4/S5/S6', () => {
  let s;
  beforeEach(async () => {
    s = (await as('karan').send('post', `${base()}/settlements`, payment({ amountPaise: 50000 })))
      .body;
    ctx.sqlite.prepare('DELETE FROM notifications').run();
  });
  const url = () => `${base()}/settlements/${s.settlementId}`;

  it('list and detail', async () => {
    const list = await as('ravi').get(`${base()}/settlements`);
    expect(list.body).toMatchObject({ total: 1, page: 1, pageSize: 20 });
    expect(list.body.items[0].permissions.canEdit).toBe(false); // not a party
    expect((await as('ravi').get(url())).body.amountPaise).toBe(50000);
  });

  it('edit by either party; over-payment check ignores this settlement', async () => {
    // Owed without this settlement is ₹700, so ₹700 is fine without confirmation.
    const res = await as('priya').send('put', url(), payment({ amountPaise: 70000, note: 'cash' }));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      amountPaise: 70000,
      note: 'cash',
      updatedBy: { membershipId: m.priya },
    });
    expect(one('SELECT recipient_user_id AS r FROM notifications').r).toBe(users.karan);

    const over = await as('priya').send('put', url(), payment({ amountPaise: 70001 }));
    expect(over.body.error.details.reason).toBe('OVERPAYMENT');
  });

  it('non-party cannot edit or delete', async () => {
    expect((await as('ravi').send('put', url(), payment())).status).toBe(403);
    expect((await as('ravi').send('delete', url())).status).toBe(403);
  });

  it('soft delete restores the balance; second delete → 409', async () => {
    expect((await as('priya').send('delete', url())).status).toBe(204);
    expect(await myNet('karan')).toBe(-70000);
    expect((await as('ravi').get(url())).body.status).toBe('deleted');
    expect((await as('priya').send('delete', url())).body.error.code).toBe('SETTLEMENT_DELETED');
    expect((await as('ravi').get(`${base()}/settlements`)).body.total).toBe(0);
  });

  it('FR-STL-09: frozen once a party has left', async () => {
    // Settle fully so Priya could leave, then she leaves.
    await as('karan').send('put', url(), payment({ amountPaise: 70000 }));
    expect((await as('priya').send('post', `${base()}/leave`, {})).status).toBe(204);
    const res = await as('karan').send('delete', url());
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVOLVES_DEPARTED_MEMBER');
    expect((await as('karan').get(url())).body.permissions.frozenReason).toBe(
      'INVOLVES_DEPARTED_MEMBER',
    );
  });

  it('history: created → updated → deleted', async () => {
    await as('karan').send('put', url(), payment({ amountPaise: 60000 }));
    await as('karan').send('delete', url());
    const history = (await as('ravi').get(`${url()}/history`)).body.items;
    expect(history.map((h) => h.action)).toEqual(['created', 'updated', 'deleted']);
    expect(history[1].before.amountPaise).toBe(50000);
    expect(history[1].after.amountPaise).toBe(60000);
  });
});

describe('AC1 activity', () => {
  it('newest first, paginated, with actor and subject', async () => {
    await as('karan').send('post', `${base()}/settlements`, payment());
    const res = await as('ravi').get(`${base()}/activity?pageSize=1`);
    expect(res.body.total).toBe(2); // expense + settlement (test fixture group has no setup events)
    expect(res.body.items[0]).toMatchObject({
      type: 'settlement_created',
      actor: { name: 'Karan Mehta' },
      subject: { type: 'settlement' },
      summary: 'Karan paid Priya ₹700.00',
    });
    expect(res.body.items).toHaveLength(1);
  });

  it('non-member → 404', async () => {
    expect((await as('ananya').get(`${base()}/activity`)).status).toBe(404);
  });
});

describe('N1–N4 notifications', () => {
  beforeEach(async () => {
    await as('karan').send('post', `${base()}/settlements`, payment({ amountPaise: 10000 }));
    await as('karan').send('post', `${base()}/settlements`, payment({ amountPaise: 10000 }));
  });

  it('lists newest first with a link; unread count; mark one and all read', async () => {
    const list = await as('priya').get('/api/notifications');
    expect(list.body.total).toBe(2);
    const [first] = list.body.items;
    expect(first).toMatchObject({
      type: 'settlement_created',
      groupName: 'Trip Goa',
      read: false,
      link: { type: 'settlement', groupId },
    });
    expect((await as('priya').get('/api/notifications/unread-count')).body).toEqual({ count: 2 });

    expect(
      (await as('priya').send('post', `/api/notifications/${first.notificationId}/read`)).status,
    ).toBe(204);
    expect((await as('priya').get('/api/notifications/unread-count')).body).toEqual({ count: 1 });
    expect((await as('priya').get('/api/notifications?unreadOnly=true')).body.total).toBe(1);

    expect((await as('priya').send('post', '/api/notifications/read-all')).status).toBe(204);
    expect((await as('priya').get('/api/notifications/unread-count')).body).toEqual({ count: 0 });
  });

  it("someone else's notification → 404", async () => {
    const id = one('SELECT id FROM notifications').id;
    expect((await as('ravi').send('post', `/api/notifications/${id}/read`)).status).toBe(404);
  });

  it('E29: history kept after group deletion, link null', async () => {
    await as('karan').send('delete', `${base()}?confirm=true`);
    const list = await as('priya').get('/api/notifications');
    expect(list.body.items[0]).toMatchObject({
      type: 'group_deleted',
      groupId: null,
      groupName: 'Trip Goa',
      link: null,
    });
    expect(list.body.items.every((n) => n.link === null)).toBe(true);
  });

  it('group-type notifications link to the group', async () => {
    await as('karan').send('post', `${base()}/members`, { userId: users.ananya });
    const [n] = (await as('ananya').get('/api/notifications')).body.items;
    expect(n.link).toEqual({ type: 'group', groupId, id: groupId });
  });
});
