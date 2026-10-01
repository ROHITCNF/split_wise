import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  createGroup,
  createTestApp,
  createUser,
  loginCookie,
  TEST_ORIGIN,
} from '../../test/helpers.js';
import { hashPassword } from '../../lib/passwords.js';
import { nowIso } from '../../lib/time.js';

let ctx, app, userId, cookie;

beforeEach(async () => {
  ({ ctx, app } = createTestApp());
  userId = createUser(ctx, { name: 'Karan', email: 'karan@example.com' });
  ctx.sqlite
    .prepare(
      `INSERT INTO login_methods (user_id, type, password_hash, created_at) VALUES (?, 'password', ?, ?)`,
    )
    .run(userId, await hashPassword('secret-pass'), nowIso());
  cookie = loginCookie(ctx, userId);
});

const send = (method, path, body) =>
  request(app)[method](path).set('Origin', TEST_ORIGIN).set('Cookie', cookie).send(body);

/** Adds an expense paid by `payer` with one share for `debtor`. */
function addDebt(groupId, payerMembershipId, debtorMembershipId, amount) {
  const now = nowIso();
  const expenseId = Number(
    ctx.sqlite
      .prepare(
        `INSERT INTO expenses (group_id, payer_membership_id, created_by_membership_id, description,
           amount_paise, expense_date, split_method, created_at, updated_at)
         VALUES (?, ?, ?, 'x', ?, '2026-09-30', 'exact', ?, ?)`,
      )
      .run(groupId, payerMembershipId, payerMembershipId, amount, now, now).lastInsertRowid,
  );
  ctx.sqlite
    .prepare(
      `INSERT INTO expense_shares (expense_id, membership_id, share_paise, position) VALUES (?, ?, ?, 0)`,
    )
    .run(expenseId, debtorMembershipId, amount);
}

describe('auth required', () => {
  it('all /api/me routes need a session', async () => {
    const res = await request(app).patch('/api/me').set('Origin', TEST_ORIGIN).send({ name: 'X' });
    expect(res.status).toBe(401);
  });
});

describe('P1 edit name', () => {
  it('updates and returns the user', async () => {
    const res = await send('patch', '/api/me', { name: '  Karan Mehta ' });
    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('Karan Mehta');
  });

  it('rejects names over 60 characters (S-1)', async () => {
    expect((await send('patch', '/api/me', { name: 'x'.repeat(61) })).status).toBe(400);
  });
});

describe('P2 change password', () => {
  it('changes the password', async () => {
    const res = await send('post', '/api/me/password', {
      currentPassword: 'secret-pass',
      newPassword: 'brand-new-pass',
    });
    expect(res.status).toBe(204);
    const login = await request(app)
      .post('/api/auth/login')
      .set('Origin', TEST_ORIGIN)
      .send({ email: 'karan@example.com', password: 'brand-new-pass' });
    expect(login.status).toBe(200);
  });

  it('wrong current password → 400 WRONG_PASSWORD', async () => {
    const res = await send('post', '/api/me/password', {
      currentPassword: 'nope',
      newPassword: 'brand-new-pass',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('WRONG_PASSWORD');
  });

  it('Google-only account → 409 NO_PASSWORD_METHOD', async () => {
    ctx.sqlite.prepare('DELETE FROM login_methods').run();
    const res = await send('post', '/api/me/password', {
      currentPassword: 'x',
      newPassword: 'brand-new-pass',
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NO_PASSWORD_METHOD');
  });
});

describe('P3 delete account (FR-AUTH-08)', () => {
  let other, groupId, memberships;
  beforeEach(() => {
    other = createUser(ctx, { name: 'Priya' });
    ({ groupId, memberships } = createGroup(ctx, {
      name: 'Trip Goa',
      adminUserId: other,
      memberUserIds: [userId],
    }));
  });

  it('E16: blocked while a balance is non-zero, with the groups listed', async () => {
    addDebt(groupId, memberships[other], memberships[userId], 35000);
    const res = await send('delete', '/api/me');
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: 'BALANCE_NOT_ZERO',
      details: { groups: [{ groupId, groupName: 'Trip Goa', netPaise: -35000 }] },
    });
  });

  it('blocked while admin of a group', async () => {
    createGroup(ctx, { name: 'Flat', adminUserId: userId, memberUserIds: [other] });
    const res = await send('delete', '/api/me');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ADMIN_MUST_CHOOSE');
    expect(res.body.error.details.groups[0].groupName).toBe('Flat');
  });

  it('tombstones the account (S-6) and logs out everywhere', async () => {
    const otherDevice = loginCookie(ctx, userId);
    const res = await send('delete', '/api/me');
    expect(res.status).toBe(204);

    expect(
      ctx.sqlite.prepare('SELECT email, name, status FROM users WHERE id = ?').get(userId),
    ).toEqual({
      email: `deleted+${userId}@invalid`,
      name: 'Karan',
      status: 'deleted',
    });
    expect(
      ctx.sqlite.prepare('SELECT status FROM memberships WHERE id = ?').get(memberships[userId])
        .status,
    ).toBe('left');
    expect(
      ctx.sqlite.prepare(`SELECT summary FROM activity_events WHERE type = 'member_left'`).get()
        .summary,
    ).toBe('Karan left the group (account deleted)');
    for (const table of ['sessions', 'login_methods']) {
      expect(
        ctx.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`).get(userId).n,
      ).toBe(0);
    }
    const me = await request(app).get('/api/auth/me').set('Cookie', otherDevice);
    expect(me.status).toBe(401);
  });

  it('frees the email for a new registration', async () => {
    await send('delete', '/api/me');
    const res = await request(app)
      .post('/api/auth/signup')
      .set('Origin', TEST_ORIGIN)
      .send({ name: 'Karan', email: 'karan@example.com', password: 'secret-pass' });
    expect(res.status).toBe(202);
  });
});
