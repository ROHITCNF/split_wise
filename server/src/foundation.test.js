import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { AppError, expenseBody } from '@splitbook/shared';
import { requireAuth } from './middleware/session.js';
import { requireAdmin, requireMember } from './middleware/membership.js';
import { validate } from './middleware/validate.js';
import { authRateLimit } from './middleware/rateLimit.js';
import { withTransaction } from './lib/transaction.js';
import { recordActivity, recordChange } from './modules/history/writers.js';
import { notify } from './modules/notifications/notify.js';
import { sha256 } from './lib/crypto.js';
import {
  buildAppWith,
  createGroup,
  createTestApp,
  createTestContext,
  createUser,
  loginCookie,
  TEST_ORIGIN,
} from './test/helpers.js';

let ctx;
beforeEach(() => {
  ctx = createTestContext();
});
afterEach(() => {
  if (ctx.sqlite.open) ctx.sqlite.close();
});

describe('health (H1) and baseline headers', () => {
  it('reports ok with database check', async () => {
    const { app } = createTestApp(ctx);
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', db: 'ok' });
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('returns 503 when the database is unreadable', async () => {
    const { app } = createTestApp(ctx);
    ctx.sqlite.close();
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'error', db: 'error' });
  });
});

describe('error format (API §1.1)', () => {
  const app = () =>
    buildAppWith(ctx, (a) => {
      a.get('/api/boom', () => {
        throw new Error('secret internals');
      });
      a.get('/api/conflict', () => {
        throw new AppError('BALANCE_NOT_ZERO', { details: { netPaise: -35000 } });
      });
      a.post('/api/echo', (req, res) => res.json(req.body));
    });

  it('unknown /api route → 404 NOT_FOUND', async () => {
    const res = await request(app()).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: expect.any(String) } });
  });

  it('AppError → its status, code and details', async () => {
    const res = await request(app()).get('/api/conflict');
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: 'BALANCE_NOT_ZERO',
      details: { netPaise: -35000 },
    });
  });

  it('unexpected error → 500 INTERNAL without leaking the message', async () => {
    const res = await request(app()).get('/api/boom');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL');
    expect(JSON.stringify(res.body)).not.toContain('secret internals');
  });

  it('malformed JSON → 400 VALIDATION_ERROR', async () => {
    const res = await request(app())
      .post('/api/echo')
      .set('Origin', TEST_ORIGIN)
      .set('Content-Type', 'application/json')
      .send('{"oops"');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('CSRF origin check', () => {
  const app = () =>
    buildAppWith(ctx, (a) => {
      a.get('/api/thing', (req, res) => res.json({ ok: true }));
      a.post('/api/thing', (req, res) => res.json({ ok: true }));
    });

  it('allows GET without Origin', async () => {
    expect((await request(app()).get('/api/thing')).status).toBe(200);
  });

  it('rejects POST without Origin', async () => {
    const res = await request(app()).post('/api/thing');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('rejects POST from another origin', async () => {
    expect(
      (await request(app()).post('/api/thing').set('Origin', 'https://evil.example')).status,
    ).toBe(403);
  });

  it('allows POST from the app origin', async () => {
    expect((await request(app()).post('/api/thing').set('Origin', TEST_ORIGIN)).status).toBe(200);
  });
});

describe('validation middleware', () => {
  const app = () =>
    buildAppWith(ctx, (a) => {
      a.post('/api/expenses', validate({ body: expenseBody }), (req, res) =>
        res.json(req.valid.body),
      );
    });
  const post = (body) => request(app()).post('/api/expenses').set('Origin', TEST_ORIGIN).send(body);
  const valid = {
    description: 'Dinner',
    amountPaise: 1000,
    expenseDate: '2026-09-30',
    payerMembershipId: 1,
    splitMethod: 'equal',
    participants: [{ membershipId: 1 }],
  };

  it('passes parsed data on', async () => {
    const res = await post(valid);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ notes: null, confirm: false });
  });

  it('returns fieldErrors on bad input', async () => {
    const res = await post({ ...valid, amountPaise: 0, description: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(res.body.error.fieldErrors).sort()).toEqual(['amountPaise', 'description']);
  });

  it('future date → FUTURE_DATE', async () => {
    const res = await post({ ...valid, expenseDate: '2999-01-01' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('FUTURE_DATE');
  });
});

describe('sessions & auth gate', () => {
  const app = () =>
    buildAppWith(ctx, (a) => {
      a.get('/api/me', requireAuth, (req, res) => res.json({ id: req.user.id }));
    });

  it('401 without a cookie', async () => {
    const res = await request(app()).get('/api/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('401 with an unknown token', async () => {
    expect((await request(app()).get('/api/me').set('Cookie', 'sid=forged')).status).toBe(401);
  });

  it('accepts a valid session; only the token hash is stored', async () => {
    const userId = createUser(ctx);
    const cookie = loginCookie(ctx, userId);
    const res = await request(app()).get('/api/me').set('Cookie', cookie);
    expect(res.body).toEqual({ id: userId });

    const token = cookie.split('=')[1];
    const stored = ctx.sqlite.prepare('SELECT id FROM sessions').get().id;
    expect(stored).toBe(sha256(token));
    expect(stored).not.toBe(token);
  });

  it('401 when the session expired', async () => {
    const cookie = loginCookie(ctx, createUser(ctx));
    ctx.sqlite.prepare(`UPDATE sessions SET expires_at = '2000-01-01T00:00:00.000Z'`).run();
    expect((await request(app()).get('/api/me').set('Cookie', cookie)).status).toBe(401);
  });

  it('401 when the account is deleted', async () => {
    const userId = createUser(ctx);
    const cookie = loginCookie(ctx, userId);
    ctx.sqlite.prepare(`UPDATE users SET status = 'deleted' WHERE id = ?`).run(userId);
    expect((await request(app()).get('/api/me').set('Cookie', cookie)).status).toBe(401);
  });

  it('slides the expiry when last seen over a minute ago (S-4)', async () => {
    const cookie = loginCookie(ctx, createUser(ctx));
    ctx.sqlite
      .prepare(
        `UPDATE sessions SET last_seen_at = '2000-01-01T00:00:00.000Z', expires_at = '2999-01-01T00:00:00.000Z'`,
      )
      .run();
    await request(app()).get('/api/me').set('Cookie', cookie);
    const row = ctx.sqlite.prepare('SELECT last_seen_at, expires_at FROM sessions').get();
    expect(row.last_seen_at > '2026').toBe(true);
    expect(row.expires_at < '2999').toBe(true);
  });
});

describe('group membership gate (NFR-06)', () => {
  let admin, member, outsider, groupId, memberships;
  beforeEach(() => {
    admin = createUser(ctx, { name: 'Admin' });
    member = createUser(ctx, { name: 'Member' });
    outsider = createUser(ctx, { name: 'Outsider' });
    ({ groupId, memberships } = createGroup(ctx, { adminUserId: admin, memberUserIds: [member] }));
  });

  const app = () =>
    buildAppWith(ctx, (a) => {
      a.get('/api/groups/:groupId', requireAuth, requireMember(ctx), (req, res) =>
        res.json({ groupId: req.group.id, role: req.membership.role }),
      );
      a.post(
        '/api/groups/:groupId/admin-only',
        requireAuth,
        requireMember(ctx),
        requireAdmin,
        (req, res) => res.json({ ok: true }),
      );
    });

  it('member gets the group', async () => {
    const res = await request(app())
      .get(`/api/groups/${groupId}`)
      .set('Cookie', loginCookie(ctx, member));
    expect(res.body).toEqual({ groupId, role: 'member' });
  });

  it('non-member gets 404, not 403', async () => {
    const res = await request(app())
      .get(`/api/groups/${groupId}`)
      .set('Cookie', loginCookie(ctx, outsider));
    expect(res.status).toBe(404);
  });

  it('past member gets 404 (FR-GRP-15)', async () => {
    ctx.sqlite
      .prepare(
        `UPDATE memberships SET status = 'left', ended_at = '2026-10-01T00:00:00.000Z' WHERE id = ?`,
      )
      .run(memberships[member]);
    const res = await request(app())
      .get(`/api/groups/${groupId}`)
      .set('Cookie', loginCookie(ctx, member));
    expect(res.status).toBe(404);
  });

  it('missing group and non-numeric id give 404', async () => {
    const cookie = loginCookie(ctx, member);
    expect((await request(app()).get('/api/groups/9999').set('Cookie', cookie)).status).toBe(404);
    expect((await request(app()).get('/api/groups/abc').set('Cookie', cookie)).status).toBe(404);
  });

  it('admin-only action: 403 for member, 200 for admin', async () => {
    const url = `/api/groups/${groupId}/admin-only`;
    const asMember = await request(app())
      .post(url)
      .set('Origin', TEST_ORIGIN)
      .set('Cookie', loginCookie(ctx, member));
    expect(asMember.status).toBe(403);
    const asAdmin = await request(app())
      .post(url)
      .set('Origin', TEST_ORIGIN)
      .set('Cookie', loginCookie(ctx, admin));
    expect(asAdmin.status).toBe(200);
  });
});

describe('auth rate limit', () => {
  it('returns 429 RATE_LIMITED with retryAfterSeconds after the limit', async () => {
    const app = buildAppWith(ctx, (a) => {
      a.post('/api/auth/login', authRateLimit({ limit: 3 }), (req, res) => res.json({ ok: true }));
    });
    for (let i = 0; i < 3; i++) {
      expect((await request(app).post('/api/auth/login').set('Origin', TEST_ORIGIN)).status).toBe(
        200,
      );
    }
    const res = await request(app).post('/api/auth/login').set('Origin', TEST_ORIGIN);
    expect(res.status).toBe(429);
    expect(res.body.error).toMatchObject({
      code: 'RATE_LIMITED',
      details: { retryAfterSeconds: expect.any(Number) },
    });
  });
});

describe('transactions and writers (ADR-007)', () => {
  let userA, userB, groupId, memberships;
  beforeEach(() => {
    userA = createUser(ctx, { name: 'A' });
    userB = createUser(ctx, { name: 'B' });
    ({ groupId, memberships } = createGroup(ctx, {
      name: 'Trip',
      adminUserId: userA,
      memberUserIds: [userB],
    }));
  });
  const count = (table) => ctx.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;

  it('writes change record, activity and notifications together', () => {
    withTransaction(ctx, () => {
      recordChange(ctx, {
        groupId,
        entityType: 'expense',
        entityId: 1,
        action: 'updated',
        actorMembershipId: memberships[userA],
        before: { amountPaise: 100 },
        after: { amountPaise: 200 },
      });
      recordActivity(ctx, {
        groupId,
        actorMembershipId: memberships[userA],
        type: 'expense_updated',
        summary: 'A edited',
      });
      notify(ctx, {
        recipientUserIds: [userA, userB, userB],
        actorUserId: userA,
        group: { id: groupId, name: 'Trip' },
        type: 'expense_updated',
        entityType: 'expense',
        entityId: 1,
        message: 'A edited',
      });
    });

    expect(
      JSON.parse(ctx.sqlite.prepare('SELECT before_json FROM change_records').get().before_json),
    ).toEqual({
      amountPaise: 100,
    });
    expect(count('activity_events')).toBe(1);
    // actor excluded, duplicates collapsed
    expect(
      ctx.sqlite.prepare('SELECT recipient_user_id AS r, group_name AS g FROM notifications').all(),
    ).toEqual([{ r: userB, g: 'Trip' }]);
  });

  it('rolls everything back when the command fails', () => {
    expect(() =>
      withTransaction(ctx, () => {
        recordActivity(ctx, { groupId, type: 'group_updated', summary: 'x' });
        notify(ctx, {
          recipientUserIds: [userB],
          group: { id: groupId, name: 'Trip' },
          type: 'added_to_group',
          message: 'm',
        });
        throw new AppError('BALANCE_NOT_ZERO');
      }),
    ).toThrow(AppError);
    expect(count('activity_events')).toBe(0);
    expect(count('notifications')).toBe(0);
  });
});
