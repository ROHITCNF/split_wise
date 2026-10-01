import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApp, TEST_ORIGIN, testConfig, createTestContext } from '../../test/helpers.js';
import { MOCK_GOOGLE_USER } from './mockGoogle.js';
import { createApp } from '../../app.js';

let ctx, app, agent;
beforeEach(() => {
  ({ ctx, app } = createTestApp());
  agent = request.agent(app); // keeps cookies between requests
});

const post = (path, body) => agent.post(path).set('Origin', TEST_ORIGIN).send(body);
const signup = (body = {}) =>
  post('/api/auth/signup', {
    name: 'Karan',
    email: 'karan@example.com',
    password: 'secret-pass',
    ...body,
  });
const one = (sql, ...args) => ctx.sqlite.prepare(sql).get(...args);

const googleLogin = async (a = agent) => {
  const start = await a.get('/api/auth/google/start');
  expect(start.status).toBe(302);
  expect(start.headers.location).toMatch(/^\/api\/auth\/google\/callback\?code=.+&state=.+$/);
  return a.get(start.headers.location);
};

describe('A1 signup (no email verification, REQUIREMENTS v1.3)', () => {
  it('creates a verified account and logs in straight away', async () => {
    const res = await signup({ email: ' Karan@Example.com ' });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({
      name: 'Karan',
      email: 'karan@example.com',
      emailVerified: true,
      loginMethods: ['password'],
    });
    expect(res.headers['set-cookie'][0]).toMatch(/^sid=/);
    expect((await agent.get('/api/auth/me')).body.user.email).toBe('karan@example.com');
    expect(one('SELECT email_verified_at FROM users').email_verified_at).not.toBeNull();
  });

  it('new user is immediately searchable by others', async () => {
    await signup();
    const other = request.agent(app);
    await other
      .post('/api/auth/signup')
      .set('Origin', TEST_ORIGIN)
      .send({ name: 'Priya', email: 'priya@example.com', password: 'secret-pass' });
    const res = await other.get('/api/users/search?q=kar');
    expect(res.body.items.map((u) => u.name)).toEqual(['Karan']);
  });

  it('password is stored as an Argon2id hash', async () => {
    await signup();
    expect(one('SELECT password_hash FROM login_methods').password_hash).toMatch(/^\$argon2id\$/);
  });

  it('email already used → 409 EMAIL_ALREADY_REGISTERED', async () => {
    await signup();
    const res = await request(app)
      .post('/api/auth/signup')
      .set('Origin', TEST_ORIGIN)
      .send({ name: 'Other', email: 'KARAN@example.com', password: 'another-pass' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_ALREADY_REGISTERED');
  });

  it('cannot attach a password to an existing Google account', async () => {
    await googleLogin();
    await post('/api/auth/logout');
    const res = await signup({ email: MOCK_GOOGLE_USER.email, password: 'attacker-pass' });
    expect(res.status).toBe(409);
    expect(one(`SELECT COUNT(*) AS n FROM login_methods WHERE type = 'password'`).n).toBe(0);
  });

  it.each([
    [{ password: 'short' }, 'password'],
    [{ email: 'nope' }, 'email'],
    [{ name: '' }, 'name'],
  ])('validation %j', async (override, field) => {
    const res = await signup(override);
    expect(res.status).toBe(400);
    expect(res.body.error.fieldErrors).toHaveProperty(field);
  });

  it('removed endpoints are gone', async () => {
    expect((await post('/api/auth/verify-email', { token: 'x' })).status).toBe(404);
    expect((await post('/api/auth/resend-verification', { email: 'a@b.io' })).status).toBe(404);
    expect((await agent.get('/api/dev/outbox')).status).toBe(404);
  });
});

describe('A4 login / A7 logout / A8 me', () => {
  beforeEach(async () => {
    await signup();
    await post('/api/auth/logout');
  });

  it('logs in with a session cookie', async () => {
    const res = await post('/api/auth/login', {
      email: 'KARAN@example.com',
      password: 'secret-pass',
    });
    expect(res.status).toBe(200);
    expect(res.headers['set-cookie'][0]).toMatch(
      /^sid=.+; Max-Age=2592000; Path=\/; Expires=.+; HttpOnly; SameSite=Lax$/,
    );
    const me = await agent.get('/api/auth/me');
    expect(me.body.user).toMatchObject({ name: 'Karan', email: 'karan@example.com' });
  });

  it('wrong password and unknown email give the same 401', async () => {
    const wrong = await post('/api/auth/login', {
      email: 'karan@example.com',
      password: 'nope-nope',
    });
    const unknown = await post('/api/auth/login', {
      email: 'ghost@example.com',
      password: 'nope-nope',
    });
    expect([wrong.status, unknown.status]).toEqual([401, 401]);
    expect(wrong.body).toEqual(unknown.body);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('logout ends only this device', async () => {
    const other = request.agent(app);
    await other
      .post('/api/auth/login')
      .set('Origin', TEST_ORIGIN)
      .send({ email: 'karan@example.com', password: 'secret-pass' });
    await post('/api/auth/login', { email: 'karan@example.com', password: 'secret-pass' });

    expect((await post('/api/auth/logout')).status).toBe(204);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
    expect((await other.get('/api/auth/me')).status).toBe(200);
  });

  it('rate limits auth endpoints (10/min by default)', async () => {
    const strict = createApp(createTestContext(), {
      config: { ...testConfig, authRateLimitPerMinute: 2 },
    });
    const hit = () =>
      request(strict)
        .post('/api/auth/login')
        .set('Origin', TEST_ORIGIN)
        .send({ email: 'a@b.io', password: 'x' });
    await hit();
    await hit();
    expect((await hit()).status).toBe(429);
  });
});

describe('A5/A6 Google sign-in (mock)', () => {
  it('creates a verified user and logs in', async () => {
    const res = await googleLogin();
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${TEST_ORIGIN}/`);
    const me = await agent.get('/api/auth/me');
    expect(me.body.user).toMatchObject({
      email: MOCK_GOOGLE_USER.email,
      name: MOCK_GOOGLE_USER.name,
      emailVerified: true,
      loginMethods: ['google'],
    });
  });

  it('second sign-in reuses the same account', async () => {
    await googleLogin();
    await googleLogin(request.agent(app));
    expect(one('SELECT COUNT(*) AS n FROM users').n).toBe(1);
  });

  it('merges with an existing password account on the same email (FR-AUTH-04)', async () => {
    await signup({ email: MOCK_GOOGLE_USER.email, name: 'Mock' });
    await post('/api/auth/logout');
    await googleLogin();
    const me = await agent.get('/api/auth/me');
    expect(me.body.user.loginMethods).toEqual(['password', 'google']);
    expect(one('SELECT COUNT(*) AS n FROM users').n).toBe(1);
  });

  it('state mismatch → redirect with error, no session', async () => {
    const res = await agent.get(
      '/api/auth/google/callback?code=mock-authorization-code&state=forged',
    );
    expect(res.headers.location).toBe(`${TEST_ORIGIN}/login?error=google_failed`);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });
});

describe('production safety', () => {
  it('refuses to start in production with the mock identity provider', () => {
    expect(() =>
      createApp(createTestContext(), { config: { ...testConfig, isProduction: true } }),
    ).toThrow(/mock is disabled/);
  });

  it('starts in production when a real provider is injected', () => {
    expect(() =>
      createApp(createTestContext(), {
        config: { ...testConfig, isProduction: true },
        identityProvider: {},
      }),
    ).not.toThrow();
  });
});
