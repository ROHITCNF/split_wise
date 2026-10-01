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
const lastToken = () => new URL(ctx.mailer.outbox[0].link).searchParams.get('token');
const one = (sql, ...args) => ctx.sqlite.prepare(sql).get(...args);

async function signupAndVerify(body) {
  await signup(body);
  return post('/api/auth/verify-email', { token: lastToken() });
}

describe('A1 signup', () => {
  it('new email → 202, unverified user, verification link mailed, no session', async () => {
    const res = await signup({ email: ' Karan@Example.com ' });
    expect(res.status).toBe(202);
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(one('SELECT email, email_verified_at FROM users')).toEqual({
      email: 'karan@example.com',
      email_verified_at: null,
    });
    expect(ctx.mailer.outbox[0]).toMatchObject({
      to: 'karan@example.com',
      purpose: 'verify_email',
    });
    expect(ctx.mailer.outbox[0].link).toMatch(/^http:\/\/localhost:5173\/verify\?token=/);
  });

  it('password is stored as an Argon2id hash', async () => {
    await signup();
    expect(one('SELECT password_hash FROM login_methods').password_hash).toMatch(/^\$argon2id\$/);
  });

  it('unverified retry → replaces password and name, old link stops working', async () => {
    await signup();
    const oldToken = lastToken();
    await signup({ name: 'Karan M', password: 'new-secret-pass' });
    expect(one('SELECT name FROM users').name).toBe('Karan M');
    expect((await post('/api/auth/verify-email', { token: oldToken })).status).toBe(400);
    await post('/api/auth/verify-email', { token: lastToken() });
    expect(
      (await post('/api/auth/login', { email: 'karan@example.com', password: 'new-secret-pass' }))
        .status,
    ).toBe(200);
  });

  it('verified password account → 409 EMAIL_ALREADY_REGISTERED', async () => {
    await signupAndVerify();
    const res = await signup();
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_ALREADY_REGISTERED');
  });

  it('Google-only account → link_password token; password added only after verification (DF-3)', async () => {
    await agent.get('/api/auth/google/start').redirects(1);
    await post('/api/auth/logout');

    const res = await signup({ email: MOCK_GOOGLE_USER.email, password: 'attacker-pass' });
    expect(res.status).toBe(202);
    expect(ctx.mailer.outbox[0].purpose).toBe('link_password');
    expect(one(`SELECT COUNT(*) AS n FROM login_methods WHERE type = 'password'`).n).toBe(0);
    expect(
      (await post('/api/auth/login', { email: MOCK_GOOGLE_USER.email, password: 'attacker-pass' }))
        .status,
    ).toBe(401);

    await post('/api/auth/verify-email', { token: lastToken() });
    expect(one(`SELECT COUNT(*) AS n FROM users`).n).toBe(1);
    expect(
      (await post('/api/auth/login', { email: MOCK_GOOGLE_USER.email, password: 'attacker-pass' }))
        .status,
    ).toBe(200);
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
});

describe('A2 verify-email', () => {
  it('verifies, logs in (API-3) and the token is single-use', async () => {
    await signup();
    const token = lastToken();
    const res = await post('/api/auth/verify-email', { token });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      email: 'karan@example.com',
      emailVerified: true,
      loginMethods: ['password'],
    });
    expect((await agent.get('/api/auth/me')).status).toBe(200);

    const again = await post('/api/auth/verify-email', { token });
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('TOKEN_INVALID_OR_EXPIRED');
  });

  it('expired token is rejected (S-5)', async () => {
    await signup();
    ctx.sqlite
      .prepare(`UPDATE email_verification_tokens SET expires_at = '2000-01-01T00:00:00.000Z'`)
      .run();
    expect((await post('/api/auth/verify-email', { token: lastToken() })).status).toBe(400);
  });

  it('unknown token is rejected', async () => {
    expect((await post('/api/auth/verify-email', { token: 'nope' })).status).toBe(400);
  });

  it('only the token hash is stored', async () => {
    await signup();
    expect(one('SELECT token_hash FROM email_verification_tokens').token_hash).not.toBe(
      lastToken(),
    );
  });
});

describe('A3 resend-verification', () => {
  it('always 202; sends only for an unverified password account', async () => {
    expect(
      (await post('/api/auth/resend-verification', { email: 'ghost@example.com' })).status,
    ).toBe(202);
    expect(ctx.mailer.outbox).toHaveLength(0);

    await signup();
    await post('/api/auth/resend-verification', { email: 'karan@example.com' });
    expect(ctx.mailer.outbox).toHaveLength(2);

    await post('/api/auth/verify-email', { token: lastToken() });
    await post('/api/auth/resend-verification', { email: 'karan@example.com' });
    expect(ctx.mailer.outbox).toHaveLength(2);
  });
});

describe('A4 login / A7 logout / A8 me', () => {
  beforeEach(async () => {
    await signupAndVerify();
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

  it('unverified account → 403 EMAIL_NOT_VERIFIED (only with the right password)', async () => {
    await signup({ email: 'new@example.com' });
    expect(
      (await post('/api/auth/login', { email: 'new@example.com', password: 'wrong-pass' })).status,
    ).toBe(401);
    const res = await post('/api/auth/login', {
      email: 'new@example.com',
      password: 'secret-pass',
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
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
  const googleLogin = async (a = agent) => {
    const start = await a.get('/api/auth/google/start');
    expect(start.status).toBe(302);
    expect(start.headers.location).toMatch(/^\/api\/auth\/google\/callback\?code=.+&state=.+$/);
    return a.get(start.headers.location);
  };

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
    await signupAndVerify({ email: MOCK_GOOGLE_USER.email, name: 'Mock' });
    await post('/api/auth/logout');
    await googleLogin();
    const me = await agent.get('/api/auth/me');
    expect(me.body.user.loginMethods).toEqual(['password', 'google']);
    expect(one('SELECT COUNT(*) AS n FROM users').n).toBe(1);
  });

  it('verifies a pending unverified password signup on the same email', async () => {
    await signup({ email: MOCK_GOOGLE_USER.email });
    await googleLogin();
    expect(one('SELECT email_verified_at FROM users').email_verified_at).not.toBeNull();
  });

  it('state mismatch → redirect with error, no session', async () => {
    const res = await agent.get(
      '/api/auth/google/callback?code=mock-authorization-code&state=forged',
    );
    expect(res.headers.location).toBe(`${TEST_ORIGIN}/login?error=google_failed`);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });
});

describe('X1 dev outbox and production safety', () => {
  it('lists verification links outside production', async () => {
    await signup();
    const res = await agent.get('/api/dev/outbox');
    expect(res.body.items[0]).toMatchObject({ to: 'karan@example.com', purpose: 'verify_email' });
  });

  it('refuses to start in production with mock services', () => {
    expect(() =>
      createApp(createTestContext(), { config: { ...testConfig, isProduction: true } }),
    ).toThrow(/mocks are disabled/);
  });

  it('does not mount the dev outbox in production', async () => {
    const prod = createApp(createTestContext(), {
      config: { ...testConfig, isProduction: true },
      mailer: { send() {} },
      identityProvider: {},
    });
    expect((await request(prod).get('/api/dev/outbox')).status).toBe(404);
  });
});
