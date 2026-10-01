import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getTableColumns, getTableName } from 'drizzle-orm';
import { openDatabase } from './connection.js';
import { migrate } from './migrate.js';
import * as schema from './schema.js';
import { seed } from './seed.js';
import { backupDatabase } from './backup.js';

const T = '2026-10-01T00:00:00.000Z';

let sqlite;
beforeEach(() => {
  ({ sqlite } = openDatabase(':memory:'));
});
afterEach(() => sqlite.close());

/** Minimal fixture: 3 users, one group with admin + 2 members. Returns ids. */
function fixture() {
  const user = sqlite.prepare(
    `INSERT INTO users (name, email, email_verified_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
  );
  const [u1, u2, u3] = ['a', 'b', 'c'].map((n) =>
    Number(user.run(n.toUpperCase(), `${n}@x.io`, T, T, T).lastInsertRowid),
  );
  const groupId = Number(
    sqlite
      .prepare(
        `INSERT INTO groups (name, created_by_user_id, created_at, updated_at) VALUES ('G', ?, ?, ?)`,
      )
      .run(u1, T, T).lastInsertRowid,
  );
  const member = sqlite.prepare(
    `INSERT INTO memberships (group_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)`,
  );
  const m1 = Number(member.run(groupId, u1, 'admin', T).lastInsertRowid);
  const m2 = Number(member.run(groupId, u2, 'member', T).lastInsertRowid);
  const m3 = Number(member.run(groupId, u3, 'member', T).lastInsertRowid);
  return { u1, u2, u3, groupId, m1, m2, m3 };
}

function insertExpense({ groupId, m1 }, amount = 30000) {
  return sqlite
    .prepare(
      `INSERT INTO expenses (group_id, payer_membership_id, created_by_membership_id, description,
         amount_paise, expense_date, split_method, created_at, updated_at)
       VALUES (?, ?, ?, 'x', ?, '2026-09-30', 'equal', ?, ?)`,
    )
    .run(groupId, m1, m1, amount, T, T);
}

describe('connection & migrations', () => {
  it('sets foreign keys on and records the migration', () => {
    expect(sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(sqlite.prepare('SELECT id FROM schema_migrations ORDER BY id').all()).toEqual([
      { id: '0001_init' },
      { id: '0002_drop_email_verification' },
    ]);
  });

  it('is idempotent', () => {
    expect(migrate(sqlite)).toEqual([]);
  });

  it('uses WAL for file databases', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'splitbook-'));
    const { sqlite: fileDb } = openDatabase(path.join(dir, 'app.db'));
    expect(fileDb.pragma('journal_mode', { simple: true })).toBe('wal');
    fileDb.close();
    fs.rmSync(dir, { recursive: true });
  });

  it('all tables are STRICT', () => {
    const tables = sqlite
      .prepare(`SELECT name, strict FROM pragma_table_list WHERE schema = 'main'`)
      .all();
    const app = tables.filter((t) => !t.name.startsWith('sqlite_'));
    expect(app).toHaveLength(12); // 11 domain tables + schema_migrations
    expect(app.every((t) => t.strict === 1)).toBe(true);
  });
});

describe('Drizzle schema mirrors the database', () => {
  const tables = Object.values(schema);

  it.each(tables.map((t) => [getTableName(t), t]))('%s columns match', (name, table) => {
    const dbColumns = sqlite
      .prepare(`SELECT name FROM pragma_table_info(?)`)
      .all(name)
      .map((c) => c.name)
      .sort();
    const drizzleColumns = Object.values(getTableColumns(table))
      .map((c) => c.name)
      .sort();
    expect(drizzleColumns).toEqual(dbColumns);
  });
});

describe('constraints', () => {
  it('STRICT rejects wrong types', () => {
    const f = fixture();
    expect(() => insertExpense(f, 'lots')).toThrow(/cannot store TEXT value in INTEGER column/);
  });

  it('only one active admin per group', () => {
    const { groupId, u2 } = fixture();
    expect(() =>
      sqlite
        .prepare(`UPDATE memberships SET role = 'admin' WHERE group_id = ? AND user_id = ?`)
        .run(groupId, u2),
    ).toThrow(/UNIQUE/);
  });

  it('only one active membership per user per group (E19), but re-join after leaving works (E18)', () => {
    const { groupId, u2, m2 } = fixture();
    const join = sqlite.prepare(
      `INSERT INTO memberships (group_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)`,
    );
    expect(() => join.run(groupId, u2, T)).toThrow(/UNIQUE/);

    sqlite.prepare(`UPDATE memberships SET status = 'left', ended_at = ? WHERE id = ?`).run(T, m2);
    expect(() => join.run(groupId, u2, T)).not.toThrow();
  });

  it('ended_at must match status', () => {
    const { m2 } = fixture();
    expect(() =>
      sqlite.prepare(`UPDATE memberships SET status = 'left' WHERE id = ?`).run(m2),
    ).toThrow(/CHECK/);
  });

  it('amount must be > 0', () => {
    expect(() => insertExpense(fixture(), 0)).toThrow(/CHECK/);
  });

  it('expense description length 1–100', () => {
    const { groupId, m1 } = fixture();
    expect(() =>
      sqlite
        .prepare(
          `INSERT INTO expenses (group_id, payer_membership_id, created_by_membership_id, description,
             amount_paise, expense_date, split_method, created_at, updated_at)
           VALUES (?, ?, ?, ?, 100, '2026-09-30', 'equal', ?, ?)`,
        )
        .run(groupId, m1, m1, 'x'.repeat(101), T, T),
    ).toThrow(/CHECK/);
  });

  it('settlement from ≠ to', () => {
    const { groupId, m1 } = fixture();
    expect(() =>
      sqlite
        .prepare(
          `INSERT INTO settlements (group_id, from_membership_id, to_membership_id, amount_paise,
             settlement_date, recorded_by_membership_id, created_at, updated_at)
           VALUES (?, ?, ?, 100, '2026-09-30', ?, ?, ?)`,
        )
        .run(groupId, m1, m1, m1, T, T),
    ).toThrow(/CHECK/);
  });

  it('one share per participant per expense', () => {
    const f = fixture();
    const expenseId = Number(insertExpense(f).lastInsertRowid);
    const share = sqlite.prepare(
      `INSERT INTO expense_shares (expense_id, membership_id, share_paise, position) VALUES (?, ?, 100, ?)`,
    );
    share.run(expenseId, f.m2, 0);
    expect(() => share.run(expenseId, f.m2, 1)).toThrow(/UNIQUE/);
  });

  it('email is unique case-insensitively', () => {
    fixture();
    expect(() =>
      sqlite
        .prepare(
          `INSERT INTO users (name, email, created_at, updated_at) VALUES ('X', 'A@X.IO', ?, ?)`,
        )
        .run(T, T),
    ).toThrow(/UNIQUE/);
  });
});

describe('group delete', () => {
  it('cascades all group data and keeps notifications with group_id NULL (FR-NTF-05)', () => {
    const f = fixture();
    const expenseId = Number(insertExpense(f).lastInsertRowid);
    sqlite
      .prepare(
        `INSERT INTO expense_shares (expense_id, membership_id, share_paise, position) VALUES (?, ?, 30000, 0)`,
      )
      .run(expenseId, f.m2);
    sqlite
      .prepare(
        `INSERT INTO settlements (group_id, from_membership_id, to_membership_id, amount_paise,
           settlement_date, recorded_by_membership_id, created_at, updated_at)
         VALUES (?, ?, ?, 100, '2026-09-30', ?, ?, ?)`,
      )
      .run(f.groupId, f.m2, f.m1, f.m2, T, T);
    sqlite
      .prepare(
        `INSERT INTO change_records (group_id, entity_type, entity_id, action, actor_membership_id, created_at)
         VALUES (?, 'expense', ?, 'created', ?, ?)`,
      )
      .run(f.groupId, expenseId, f.m1, T);
    sqlite
      .prepare(
        `INSERT INTO activity_events (group_id, actor_membership_id, type, summary, created_at)
         VALUES (?, ?, 'group_created', 's', ?)`,
      )
      .run(f.groupId, f.m1, T);
    sqlite
      .prepare(
        `INSERT INTO notifications (recipient_user_id, group_id, group_name, type, message, created_at)
         VALUES (?, ?, 'G', 'added_to_group', 'm', ?)`,
      )
      .run(f.u2, f.groupId, T);

    sqlite.prepare('DELETE FROM groups WHERE id = ?').run(f.groupId);

    for (const table of [
      'memberships',
      'expenses',
      'expense_shares',
      'settlements',
      'change_records',
      'activity_events',
    ]) {
      expect(sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, table).toBe(0);
    }
    expect(sqlite.prepare('SELECT group_id, group_name FROM notifications').get()).toEqual({
      group_id: null,
      group_name: 'G',
    });
  });
});

describe('seed', () => {
  beforeEach(async () => {
    await seed(sqlite);
  });

  it('creates 4 verified users with password logins and 2 groups', () => {
    expect(
      sqlite.prepare('SELECT COUNT(*) AS n FROM users WHERE email_verified_at IS NOT NULL').get().n,
    ).toBe(4);
    expect(
      sqlite.prepare(`SELECT COUNT(*) AS n FROM login_methods WHERE type = 'password'`).get().n,
    ).toBe(4);
    expect(
      sqlite
        .prepare('SELECT name FROM groups ORDER BY id')
        .all()
        .map((g) => g.name),
    ).toEqual(['Trip Goa', 'Flat 302']);
  });

  it('covers every split method and has settlements', () => {
    expect(
      sqlite
        .prepare('SELECT DISTINCT split_method AS m FROM expenses ORDER BY m')
        .all()
        .map((r) => r.m),
    ).toEqual(['equal', 'exact', 'percentage']);
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM settlements').get().n).toBe(2);
  });

  it('every expense: shares sum to the amount and a "created" change record exists', () => {
    const rows = sqlite
      .prepare(
        `SELECT e.id, e.amount_paise AS amount,
                (SELECT SUM(share_paise) FROM expense_shares WHERE expense_id = e.id) AS shares,
                (SELECT COUNT(*) FROM change_records WHERE entity_type = 'expense' AND entity_id = e.id) AS changes
         FROM expenses e`,
      )
      .all();
    expect(rows).toHaveLength(6);
    for (const row of rows) {
      expect(row.shares).toBe(row.amount);
      expect(row.changes).toBe(1);
    }
  });

  it('applies the remainder rule: payer absorbs ₹0.01 on the electricity bill', () => {
    const shares = sqlite
      .prepare(
        `SELECT s.share_paise AS share, s.membership_id = e.payer_membership_id AS is_payer
         FROM expense_shares s JOIN expenses e ON e.id = s.expense_id
         WHERE e.description = 'Electricity bill' ORDER BY s.position`,
      )
      .all();
    expect(shares).toEqual([
      { share: 78189, is_payer: 0 },
      { share: 78190, is_payer: 1 },
      { share: 78189, is_payer: 0 },
    ]);
  });
});

describe('backup', () => {
  it('writes a snapshot and keeps only the newest N', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'splitbook-bk-'));
    fixture();
    for (let i = 0; i < 4; i++) {
      await backupDatabase(sqlite, { dir, keep: 3, now: new Date(Date.UTC(2026, 9, 1, 0, 0, i)) });
    }
    const files = fs.readdirSync(dir).sort();
    expect(files).toEqual([
      'app-20261001T000001Z.db',
      'app-20261001T000002Z.db',
      'app-20261001T000003Z.db',
    ]);

    const { sqlite: copy } = openDatabase(path.join(dir, files[2]));
    expect(copy.prepare('SELECT COUNT(*) AS n FROM users').get().n).toBe(3);
    copy.close();
    fs.rmSync(dir, { recursive: true });
  });
});
