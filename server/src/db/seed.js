import argon2 from 'argon2';
import { computeShares, formatPaise, todayIST } from '@splitbook/shared';
import { nowIso } from '../lib/time.js';

// Local development data (DATABASE_SCHEMA §9). Never run in production.
// Writes rows directly; once services exist (M5–M7) this can switch to calling them.

export const SEED_PASSWORD = 'password123';

const USERS = [
  { key: 'karan', name: 'Karan Mehta', email: 'karan@example.com' },
  { key: 'priya', name: 'Priya Sharma', email: 'priya@example.com' },
  { key: 'ravi', name: 'Ravi Kumar', email: 'ravi@example.com' },
  { key: 'ananya', name: 'Ananya Iyer', email: 'ananya@example.com' },
];

const GROUPS = [
  {
    name: 'Trip Goa',
    description: 'Dec 2026 beach trip',
    admin: 'karan',
    members: ['priya', 'ravi'],
    expenses: [
      {
        description: 'Dinner at Thalassa',
        notes: 'Includes tip',
        amountPaise: 120000,
        daysAgo: 1,
        payer: 'priya',
        createdBy: 'priya',
        splitMethod: 'percentage',
        participants: [
          ['karan', 5000],
          ['priya', 2500],
          ['ravi', 2500],
        ],
      },
      {
        description: 'Scooter rental for three days',
        amountPaise: 150000,
        daysAgo: 2,
        payer: 'karan',
        createdBy: 'karan',
        splitMethod: 'equal',
        participants: [['karan'], ['priya'], ['ravi']],
      },
      {
        description: 'Groceries',
        amountPaise: 45000,
        daysAgo: 3,
        payer: 'ravi',
        createdBy: 'ravi',
        splitMethod: 'exact',
        participants: [
          ['karan', 15000],
          ['priya', 15000],
          ['ravi', 15000],
        ],
      },
      {
        description: 'Water bottles',
        amountPaise: 6000,
        daysAgo: 4,
        payer: 'karan',
        createdBy: 'karan',
        splitMethod: 'equal',
        participants: [['karan']],
      },
    ],
    settlements: [{ from: 'ravi', to: 'karan', amountPaise: 30000, daysAgo: 0, note: 'UPI' }],
  },
  {
    name: 'Flat 302',
    description: 'Rent & bills',
    admin: 'priya',
    members: ['ananya', 'karan'],
    expenses: [
      {
        description: 'Electricity bill',
        amountPaise: 234568, // ₹2,345.68 ÷ 3 leaves ₹0.01 for the payer
        daysAgo: 5,
        payer: 'ananya',
        createdBy: 'ananya',
        splitMethod: 'equal',
        participants: [['priya'], ['ananya'], ['karan']],
      },
      {
        description: 'Internet',
        amountPaise: 99900,
        daysAgo: 6,
        payer: 'priya',
        createdBy: 'priya',
        splitMethod: 'exact',
        participants: [
          ['priya', 33300],
          ['ananya', 33300],
          ['karan', 33300],
        ],
      },
    ],
    settlements: [{ from: 'karan', to: 'priya', amountPaise: 20000, daysAgo: 0, note: 'cash' }],
  },
];

function daysAgo(n) {
  const date = new Date(`${todayIST()}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - n);
  return date.toISOString().slice(0, 10);
}

/**
 * Inserts seed users, groups, expenses and settlements into an empty database.
 * @param {import('better-sqlite3').Database} sqlite
 */
export async function seed(sqlite) {
  const passwordHash = await argon2.hash(SEED_PASSWORD, { type: argon2.argon2id });
  const now = nowIso();

  const stmt = {
    user: sqlite.prepare(
      `INSERT INTO users (name, email, email_verified_at, status, created_at, updated_at)
       VALUES (?, ?, ?, 'active', ?, ?)`,
    ),
    login: sqlite.prepare(
      `INSERT INTO login_methods (user_id, type, password_hash, created_at)
       VALUES (?, 'password', ?, ?)`,
    ),
    group: sqlite.prepare(
      `INSERT INTO groups (name, description, created_by_user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    ),
    membership: sqlite.prepare(
      `INSERT INTO memberships (group_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)`,
    ),
    expense: sqlite.prepare(
      `INSERT INTO expenses (group_id, payer_membership_id, created_by_membership_id, description,
         notes, amount_paise, expense_date, split_method, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    share: sqlite.prepare(
      `INSERT INTO expense_shares (expense_id, membership_id, share_paise, input_paise, input_bp, position)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ),
    settlement: sqlite.prepare(
      `INSERT INTO settlements (group_id, from_membership_id, to_membership_id, amount_paise,
         settlement_date, note, recorded_by_membership_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    change: sqlite.prepare(
      `INSERT INTO change_records (group_id, entity_type, entity_id, action, actor_membership_id,
         after_json, created_at)
       VALUES (?, ?, ?, 'created', ?, ?, ?)`,
    ),
    activity: sqlite.prepare(
      `INSERT INTO activity_events (group_id, actor_membership_id, type, subject_type, subject_id,
         summary, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ),
  };

  sqlite.transaction(() => {
    const userIds = {};
    const names = {};
    for (const u of USERS) {
      userIds[u.key] = Number(stmt.user.run(u.name, u.email, now, now, now).lastInsertRowid);
      names[u.key] = u.name.split(' ')[0];
      stmt.login.run(userIds[u.key], passwordHash, now);
    }

    for (const g of GROUPS) {
      const groupId = Number(
        stmt.group.run(g.name, g.description, userIds[g.admin], now, now).lastInsertRowid,
      );
      const m = {};
      m[g.admin] = Number(
        stmt.membership.run(groupId, userIds[g.admin], 'admin', now).lastInsertRowid,
      );
      stmt.activity.run(
        groupId,
        m[g.admin],
        'group_created',
        'group',
        groupId,
        `${names[g.admin]} created the group`,
        now,
      );
      for (const key of g.members) {
        m[key] = Number(stmt.membership.run(groupId, userIds[key], 'member', now).lastInsertRowid);
        stmt.activity.run(
          groupId,
          m[g.admin],
          'member_added',
          'membership',
          m[key],
          `${names[g.admin]} added ${names[key]}`,
          now,
        );
      }

      for (const e of g.expenses) {
        const split = computeShares({
          amountPaise: e.amountPaise,
          splitMethod: e.splitMethod,
          payerMembershipId: m[e.payer],
          participants: e.participants.map(([key, value]) => ({
            membershipId: m[key],
            ...(e.splitMethod === 'exact' && { valuePaise: value }),
            ...(e.splitMethod === 'percentage' && { valueBp: value }),
          })),
        });
        if (!split.ok) throw new Error(`Seed expense "${e.description}" is invalid: ${split.code}`);

        const expenseDate = daysAgo(e.daysAgo);
        const expenseId = Number(
          stmt.expense.run(
            groupId,
            m[e.payer],
            m[e.createdBy],
            e.description,
            e.notes ?? null,
            e.amountPaise,
            expenseDate,
            e.splitMethod,
            now,
            now,
          ).lastInsertRowid,
        );
        for (const s of split.shares) {
          stmt.share.run(
            expenseId,
            s.membershipId,
            s.sharePaise,
            s.inputPaise,
            s.inputBp,
            s.position,
          );
        }
        stmt.change.run(
          groupId,
          'expense',
          expenseId,
          m[e.createdBy],
          JSON.stringify({ ...e, expenseDate, shares: split.shares }),
          now,
        );
        stmt.activity.run(
          groupId,
          m[e.createdBy],
          'expense_created',
          'expense',
          expenseId,
          `${names[e.createdBy]} added '${e.description}' ${formatPaise(e.amountPaise)}`,
          now,
        );
      }

      for (const s of g.settlements) {
        const settlementDate = daysAgo(s.daysAgo);
        const settlementId = Number(
          stmt.settlement.run(
            groupId,
            m[s.from],
            m[s.to],
            s.amountPaise,
            settlementDate,
            s.note,
            m[s.from],
            now,
            now,
          ).lastInsertRowid,
        );
        stmt.change.run(
          groupId,
          'settlement',
          settlementId,
          m[s.from],
          JSON.stringify({ ...s, settlementDate }),
          now,
        );
        stmt.activity.run(
          groupId,
          m[s.from],
          'settlement_created',
          'settlement',
          settlementId,
          `${names[s.from]} paid ${names[s.to]} ${formatPaise(s.amountPaise)}`,
          now,
        );
      }
    }
  })();
}
