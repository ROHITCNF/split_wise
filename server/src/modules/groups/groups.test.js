import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApp, createUser, loginCookie, TEST_ORIGIN } from '../../test/helpers.js';
import { nowIso } from '../../lib/time.js';

let ctx, app, karan, priya, ravi, ananya, cookies;

beforeEach(() => {
  ({ ctx, app } = createTestApp());
  karan = createUser(ctx, { name: 'Karan Mehta', email: 'karan@example.com' });
  priya = createUser(ctx, { name: 'Priya Sharma', email: 'priya@example.com' });
  ravi = createUser(ctx, { name: 'Ravi Kumar', email: 'ravi@example.com' });
  ananya = createUser(ctx, { name: 'Ananya Iyer', email: 'ananya@example.com' });
  cookies = Object.fromEntries(
    [karan, priya, ravi, ananya].map((id) => [id, loginCookie(ctx, id)]),
  );
});

const as = (userId) => ({
  get: (url) => request(app).get(url).set('Cookie', cookies[userId]),
  send: (method, url, body) =>
    request(app)[method](url).set('Origin', TEST_ORIGIN).set('Cookie', cookies[userId]).send(body),
});
const all = (sql, ...args) => ctx.sqlite.prepare(sql).all(...args);
const one = (sql, ...args) => ctx.sqlite.prepare(sql).get(...args);

async function createTrip(members = [priya, ravi]) {
  const res = await as(karan).send('post', '/api/groups', {
    name: 'Trip Goa',
    description: 'Dec 2026',
    memberUserIds: members,
  });
  expect(res.status).toBe(201);
  return res.body;
}

const membershipOf = (group, userId) => group.members.find((m) => m.userId === userId).membershipId;

/** Debt: `debtor` owes `payer` `amount` via a one-share exact expense. */
function addDebt(groupId, payerMembershipId, debtorMembershipId, amount) {
  const now = nowIso();
  const expenseId = Number(
    ctx.sqlite
      .prepare(
        `INSERT INTO expenses (group_id, payer_membership_id, created_by_membership_id, description,
           amount_paise, expense_date, split_method, created_at, updated_at)
         VALUES (?, ?, ?, 'Debt', ?, '2026-09-30', 'exact', ?, ?)`,
      )
      .run(groupId, payerMembershipId, payerMembershipId, amount, now, now).lastInsertRowid,
  );
  ctx.sqlite
    .prepare(
      `INSERT INTO expense_shares (expense_id, membership_id, share_paise, position) VALUES (?, ?, ?, 0)`,
    )
    .run(expenseId, debtorMembershipId, amount);
}

describe('U1 user search', () => {
  it('finds verified active users by partial name, excluding self', async () => {
    createUser(ctx, { name: 'Priyanka Unverified', verified: false });
    createUser(ctx, { name: 'Priyam Deleted', status: 'deleted' });
    const res = await as(karan).get('/api/users/search?q=pri');
    expect(res.body.items).toEqual([
      { userId: priya, name: 'Priya Sharma', email: 'priya@example.com' },
    ]);
    expect((await as(karan).get('/api/users/search?q=kar')).body.items).toEqual([]);
  });

  it('with groupId, hides current members', async () => {
    const group = await createTrip([priya]);
    // "ya" matches Priya (already a member → hidden) and Ananya.
    const res = await as(karan).get(`/api/users/search?q=ya&groupId=${group.groupId}`);
    expect(res.body.items.map((u) => u.userId)).toEqual([ananya]);
  });

  it('groupId of a group I am not in → 404', async () => {
    const group = await createTrip([priya]);
    expect((await as(ananya).get(`/api/users/search?q=pri&groupId=${group.groupId}`)).status).toBe(
      404,
    );
  });

  it('treats % and _ literally and caps results at 10', async () => {
    expect((await as(karan).get('/api/users/search?q=%25%25')).body.items).toEqual([]);
    for (let i = 0; i < 12; i++) createUser(ctx, { name: `Zed ${i}` });
    expect((await as(karan).get('/api/users/search?q=zed')).body.items).toHaveLength(10);
  });

  it('query must be 2–60 characters', async () => {
    expect((await as(karan).get('/api/users/search?q=p')).status).toBe(400);
  });
});

describe('G2 create group', () => {
  it('creator is admin, members added, activity + notifications written', async () => {
    const group = await createTrip();
    expect(group).toMatchObject({
      name: 'Trip Goa',
      description: 'Dec 2026',
      me: { role: 'admin', netPaise: 0 },
    });
    expect(group.members.map((m) => [m.name, m.role])).toEqual([
      ['Karan Mehta', 'admin'],
      ['Priya Sharma', 'member'],
      ['Ravi Kumar', 'member'],
    ]);
    expect(all('SELECT type FROM activity_events ORDER BY id').map((r) => r.type)).toEqual([
      'group_created',
      'member_added',
      'member_added',
    ]);
    expect(all(`SELECT recipient_user_id AS r, message FROM notifications ORDER BY r`)).toEqual([
      { r: priya, message: 'Karan added you to Trip Goa' },
      { r: ravi, message: 'Karan added you to Trip Goa' },
    ]);
  });

  it('E20: no other members → 400 GROUP_MIN_MEMBERS', async () => {
    const res = await as(karan).send('post', '/api/groups', { name: 'Solo', memberUserIds: [] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('GROUP_MIN_MEMBERS');
  });

  it('E22: unverified, deleted, unknown or self → 400 USER_NOT_ELIGIBLE', async () => {
    const unverified = createUser(ctx, { verified: false });
    const res = await as(karan).send('post', '/api/groups', {
      name: 'X',
      memberUserIds: [priya, unverified, 99999, karan],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({
      code: 'USER_NOT_ELIGIBLE',
      details: { userIds: [unverified, 99999, karan] },
    });
    expect(one('SELECT COUNT(*) AS n FROM groups').n).toBe(0);
  });

  it('group names need not be unique (FR-GRP-03)', async () => {
    await createTrip();
    await createTrip();
    expect(one('SELECT COUNT(*) AS n FROM groups').n).toBe(2);
  });
});

describe('G1 list / G3 detail', () => {
  it('lists my active groups with my net', async () => {
    const group = await createTrip();
    addDebt(group.groupId, membershipOf(group, priya), membershipOf(group, karan), 35000);
    const res = await as(karan).get('/api/groups');
    expect(res.body.items).toEqual([
      expect.objectContaining({
        groupId: group.groupId,
        myRole: 'admin',
        memberCount: 3,
        myNetPaise: -35000,
      }),
    ]);
    expect((await as(ananya).get('/api/groups')).body.items).toEqual([]);
  });

  it('detail shows nets per member and past members', async () => {
    const group = await createTrip();
    addDebt(group.groupId, membershipOf(group, priya), membershipOf(group, karan), 35000);
    await as(karan).send(
      'delete',
      `/api/groups/${group.groupId}/members/${membershipOf(group, ravi)}`,
    );

    const res = await as(priya).get(`/api/groups/${group.groupId}`);
    expect(res.body.me).toEqual({
      membershipId: membershipOf(group, priya),
      role: 'member',
      netPaise: 35000,
    });
    expect(res.body.members.map((m) => [m.name, m.netPaise])).toEqual([
      ['Karan Mehta', -35000],
      ['Priya Sharma', 35000],
    ]);
    expect(res.body.pastMembers).toEqual([
      expect.objectContaining({
        name: 'Ravi Kumar',
        status: 'removed',
        endedAt: expect.any(String),
      }),
    ]);
  });

  it('non-member → 404', async () => {
    const group = await createTrip();
    expect((await as(ananya).get(`/api/groups/${group.groupId}`)).status).toBe(404);
  });
});

describe('G4 edit group', () => {
  it('any member can rename; activity recorded', async () => {
    const group = await createTrip();
    const res = await as(priya).send('patch', `/api/groups/${group.groupId}`, {
      name: 'Goa 2026',
      description: '',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Goa 2026', description: null });
    expect(one(`SELECT summary FROM activity_events WHERE type = 'group_updated'`).summary).toBe(
      "Priya renamed the group to 'Goa 2026' and updated the description",
    );
  });

  it('empty update → 400', async () => {
    const group = await createTrip();
    expect((await as(priya).send('patch', `/api/groups/${group.groupId}`, {})).status).toBe(400);
  });
});

describe('G5 delete group', () => {
  it('member → 403', async () => {
    const group = await createTrip();
    expect((await as(priya).send('delete', `/api/groups/${group.groupId}`)).status).toBe(403);
  });

  it('E17: open balances need confirmation, then everything is deleted and members notified', async () => {
    const group = await createTrip();
    addDebt(group.groupId, membershipOf(group, priya), membershipOf(group, karan), 35000);

    const first = await as(karan).send('delete', `/api/groups/${group.groupId}`);
    expect(first.status).toBe(409);
    expect(first.body.error).toMatchObject({
      code: 'CONFIRMATION_REQUIRED',
      details: {
        reason: 'GROUP_HAS_BALANCES',
        pairs: [
          {
            from: expect.objectContaining({ name: 'Karan Mehta' }),
            to: expect.objectContaining({ name: 'Priya Sharma' }),
            amountPaise: 35000,
          },
        ],
      },
    });
    expect(one('SELECT COUNT(*) AS n FROM groups').n).toBe(1);

    expect(
      (await as(karan).send('delete', `/api/groups/${group.groupId}?confirm=true`)).status,
    ).toBe(204);
    expect(one('SELECT COUNT(*) AS n FROM groups').n).toBe(0);
    expect(
      all(
        `SELECT recipient_user_id AS r, group_id AS g, message FROM notifications WHERE type = 'group_deleted' ORDER BY r`,
      ),
    ).toEqual([
      { r: priya, g: null, message: 'Karan deleted the group Trip Goa' },
      { r: ravi, g: null, message: 'Karan deleted the group Trip Goa' },
    ]);
  });

  it('no balances → deleted without confirmation', async () => {
    const group = await createTrip();
    expect((await as(karan).send('delete', `/api/groups/${group.groupId}`)).status).toBe(204);
  });
});

describe('M1 add member', () => {
  it('admin adds a member; they are notified', async () => {
    const group = await createTrip();
    const res = await as(karan).send('post', `/api/groups/${group.groupId}/members`, {
      userId: ananya,
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      userId: ananya,
      name: 'Ananya Iyer',
      status: 'active',
      role: 'member',
    });
    expect(
      one(`SELECT message FROM notifications WHERE recipient_user_id = ?`, ananya).message,
    ).toBe('Karan added you to Trip Goa');
  });

  it('member cannot add → 403', async () => {
    const group = await createTrip();
    expect(
      (await as(priya).send('post', `/api/groups/${group.groupId}/members`, { userId: ananya }))
        .status,
    ).toBe(403);
  });

  it('E19: already a member → 409 ALREADY_MEMBER', async () => {
    const group = await createTrip();
    const res = await as(karan).send('post', `/api/groups/${group.groupId}/members`, {
      userId: priya,
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_MEMBER');
  });

  it('E18: re-added past member gets a new membership', async () => {
    const group = await createTrip();
    const old = membershipOf(group, ravi);
    await as(karan).send('delete', `/api/groups/${group.groupId}/members/${old}`);
    const res = await as(karan).send('post', `/api/groups/${group.groupId}/members`, {
      userId: ravi,
    });
    expect(res.status).toBe(201);
    expect(res.body.membershipId).not.toBe(old);
    expect(
      all('SELECT status FROM memberships WHERE user_id = ? ORDER BY id', ravi).map(
        (r) => r.status,
      ),
    ).toEqual(['removed', 'active']);
  });
});

describe('M2 remove member', () => {
  it('admin removes a settled member; removed user notified and loses access', async () => {
    const group = await createTrip();
    const res = await as(karan).send(
      'delete',
      `/api/groups/${group.groupId}/members/${membershipOf(group, ravi)}`,
    );
    expect(res.status).toBe(204);
    expect(
      one(
        `SELECT message FROM notifications WHERE recipient_user_id = ? AND type = 'removed_from_group'`,
        ravi,
      ).message,
    ).toBe('Karan removed you from Trip Goa');
    expect((await as(ravi).get(`/api/groups/${group.groupId}`)).status).toBe(404);
  });

  it('E15: non-zero balance → 409 BALANCE_NOT_ZERO', async () => {
    const group = await createTrip();
    addDebt(group.groupId, membershipOf(group, karan), membershipOf(group, ravi), 12000);
    const res = await as(karan).send(
      'delete',
      `/api/groups/${group.groupId}/members/${membershipOf(group, ravi)}`,
    );
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: 'BALANCE_NOT_ZERO',
      details: { netPaise: -12000 },
    });
  });

  it('E28: admin removing self → 409 CANNOT_REMOVE_SELF', async () => {
    const group = await createTrip();
    const res = await as(karan).send(
      'delete',
      `/api/groups/${group.groupId}/members/${membershipOf(group, karan)}`,
    );
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CANNOT_REMOVE_SELF');
  });

  it('unknown membership → 404; member cannot remove → 403', async () => {
    const group = await createTrip();
    expect(
      (await as(karan).send('delete', `/api/groups/${group.groupId}/members/99999`)).status,
    ).toBe(404);
    expect(
      (
        await as(priya).send(
          'delete',
          `/api/groups/${group.groupId}/members/${membershipOf(group, ravi)}`,
        )
      ).status,
    ).toBe(403);
  });
});

describe('M3 leave', () => {
  it('member with zero balance leaves', async () => {
    const group = await createTrip();
    expect((await as(ravi).send('post', `/api/groups/${group.groupId}/leave`, {})).status).toBe(
      204,
    );
    expect(
      one('SELECT status FROM memberships WHERE id = ?', membershipOf(group, ravi)).status,
    ).toBe('left');
    expect(one(`SELECT summary FROM activity_events WHERE type = 'member_left'`).summary).toBe(
      'Ravi left the group',
    );
  });

  it('E15: member with a balance cannot leave', async () => {
    const group = await createTrip();
    addDebt(group.groupId, membershipOf(group, ravi), membershipOf(group, priya), 5000);
    const res = await as(ravi).send('post', `/api/groups/${group.groupId}/leave`, {});
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'BALANCE_NOT_ZERO', details: { netPaise: 5000 } });
  });

  it('a member sending an admin mode just leaves (cannot delete the group)', async () => {
    const group = await createTrip();
    await as(ravi).send('post', `/api/groups/${group.groupId}/leave`, {
      mode: 'delete',
      confirm: true,
    });
    expect(one('SELECT COUNT(*) AS n FROM groups').n).toBe(1);
  });

  it('E20: group can drop to a single member and stay usable (FR-GRP-21)', async () => {
    const group = await createTrip();
    await as(priya).send('post', `/api/groups/${group.groupId}/leave`, {});
    await as(ravi).send('post', `/api/groups/${group.groupId}/leave`, {});
    const res = await as(karan).get(`/api/groups/${group.groupId}`);
    expect(res.body.members).toHaveLength(1);
  });

  describe('admin (E20a, FR-GRP-16..19)', () => {
    it('no mode → 409 ADMIN_MUST_CHOOSE', async () => {
      const group = await createTrip();
      const res = await as(karan).send('post', `/api/groups/${group.groupId}/leave`, {});
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ADMIN_MUST_CHOOSE');
    });

    it('transfer: new admin set, old admin left, everyone notified', async () => {
      const group = await createTrip();
      const res = await as(karan).send('post', `/api/groups/${group.groupId}/leave`, {
        mode: 'transfer',
        newAdminMembershipId: membershipOf(group, priya),
      });
      expect(res.status).toBe(204);
      const detail = await as(priya).get(`/api/groups/${group.groupId}`);
      expect(detail.body.me.role).toBe('admin');
      expect(detail.body.pastMembers[0]).toMatchObject({ name: 'Karan Mehta', status: 'left' });
      expect(
        all(
          `SELECT recipient_user_id AS r FROM notifications WHERE type = 'admin_transferred' ORDER BY r`,
        ).map((x) => x.r),
      ).toEqual([priya, ravi].sort((a, b) => a - b));
    });

    it('transfer blocked while admin has a balance', async () => {
      const group = await createTrip();
      addDebt(group.groupId, membershipOf(group, priya), membershipOf(group, karan), 100);
      const res = await as(karan).send('post', `/api/groups/${group.groupId}/leave`, {
        mode: 'transfer',
        newAdminMembershipId: membershipOf(group, priya),
      });
      expect(res.body.error.code).toBe('BALANCE_NOT_ZERO');
    });

    it('transfer to self, a non-member or a past member → 400 INVALID_NEW_ADMIN', async () => {
      const group = await createTrip();
      await as(ravi).send('post', `/api/groups/${group.groupId}/leave`, {});
      for (const target of [membershipOf(group, karan), 99999, membershipOf(group, ravi)]) {
        const res = await as(karan).send('post', `/api/groups/${group.groupId}/leave`, {
          mode: 'transfer',
          newAdminMembershipId: target,
        });
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('INVALID_NEW_ADMIN');
      }
    });

    it('delete always needs confirmation, then removes the group', async () => {
      const group = await createTrip();
      const first = await as(karan).send('post', `/api/groups/${group.groupId}/leave`, {
        mode: 'delete',
      });
      expect(first.status).toBe(409);
      expect(first.body.error.details).toEqual({ reason: 'GROUP_DELETE' });

      addDebt(group.groupId, membershipOf(group, priya), membershipOf(group, ravi), 100);
      const withBalances = await as(karan).send('post', `/api/groups/${group.groupId}/leave`, {
        mode: 'delete',
      });
      expect(withBalances.body.error.details.reason).toBe('GROUP_HAS_BALANCES');

      const done = await as(karan).send('post', `/api/groups/${group.groupId}/leave`, {
        mode: 'delete',
        confirm: true,
      });
      expect(done.status).toBe(204);
      expect(one('SELECT COUNT(*) AS n FROM groups').n).toBe(0);
    });
  });
});
