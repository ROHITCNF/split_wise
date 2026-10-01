// Test helpers: in-memory database, app builders, fixtures and logged-in cookies.
import express from 'express';
import { openDatabase } from '../db/connection.js';
import { applyCoreMiddleware, applyErrorHandling, createApp } from '../app.js';
import { startSession } from '../lib/sessions.js';
import { nowIso } from '../lib/time.js';

export const TEST_ORIGIN = 'http://localhost:5173';

export const testConfig = Object.freeze({
  nodeEnv: 'test',
  isProduction: false,
  port: 0,
  appOrigin: TEST_ORIGIN,
  dbPath: ':memory:',
  sessionTtlDays: 30,
  cookieSecure: false,
});

/** Fresh in-memory database + config, shaped like the app's `ctx`. */
export function createTestContext() {
  return { ...openDatabase(':memory:'), config: testConfig };
}

/** The real app on a test context. */
export function createTestApp(ctx = createTestContext()) {
  return { ctx, app: createApp(ctx, { config: ctx.config }) };
}

/** Core middleware + custom routes + error handling, for testing middleware in isolation. */
export function buildAppWith(ctx, mount) {
  const app = express();
  applyCoreMiddleware(app, ctx);
  mount(app);
  applyErrorHandling(app);
  return app;
}

export function createUser(ctx, { name = 'User', email, verified = true, status = 'active' } = {}) {
  const now = nowIso();
  const info = ctx.sqlite
    .prepare(
      `INSERT INTO users (name, email, email_verified_at, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      name,
      email ??
        `${name.toLowerCase().replace(/\s+/g, '.')}.${Math.random().toString(36).slice(2, 8)}@test.io`,
      verified ? now : null,
      status,
      now,
      now,
    );
  return Number(info.lastInsertRowid);
}

/** Creates a group; first user is admin. Returns { groupId, memberships: { [userId]: membershipId } }. */
export function createGroup(ctx, { name = 'Group', adminUserId, memberUserIds = [] }) {
  const now = nowIso();
  const groupId = Number(
    ctx.sqlite
      .prepare(
        `INSERT INTO groups (name, created_by_user_id, created_at, updated_at) VALUES (?, ?, ?, ?)`,
      )
      .run(name, adminUserId, now, now).lastInsertRowid,
  );
  const insert = ctx.sqlite.prepare(
    `INSERT INTO memberships (group_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)`,
  );
  const memberships = {};
  memberships[adminUserId] = Number(insert.run(groupId, adminUserId, 'admin', now).lastInsertRowid);
  for (const userId of memberUserIds) {
    memberships[userId] = Number(insert.run(groupId, userId, 'member', now).lastInsertRowid);
  }
  return { groupId, memberships };
}

/** Starts a real session for the user and returns the Cookie header value. */
export function loginCookie(ctx, userId) {
  let cookie;
  const res = { cookie: (name, value) => (cookie = `${name}=${value}`) };
  startSession(ctx, res, { userId, userAgent: 'vitest' });
  return cookie;
}
