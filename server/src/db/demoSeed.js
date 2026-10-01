import argon2 from 'argon2';
import { todayIST } from '@splitbook/shared';
import { atTime, nowIso } from '../lib/time.js';
import { owedBetween, pairBalances } from '../modules/balances/service.js';
import { createExpense, deleteExpense, updateExpense } from '../modules/expenses/service.js';
import { addMember, createGroup, leaveGroup } from '../modules/groups/service.js';
import { recordSettlement } from '../modules/settlements/service.js';
import { SEED_PASSWORD } from './seed.js';

// Presentation data (`npm run db:demo`), added on top of the base seed (db/seed.js).
//
// Everything goes through the real services, so every business rule is enforced and
// change records, activity and notifications are written exactly as in the app.
// Events run in date order with the clock set to each event's time, so feeds and
// notifications show realistic "when". Dates are relative to today, so the demo
// always looks recent (this week / this month reports have data).

const NEW_USERS = [
  ['arjun', 'Arjun Nair'],
  ['sneha', 'Sneha Reddy'],
  ['vikram', 'Vikram Singh'],
  ['meera', 'Meera Joshi'],
  ['rohan', 'Rohan Das'],
  ['isha', 'Isha Kapoor'],
];
const BASE_USERS = ['karan', 'priya', 'ravi', 'ananya'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** Calendar date `days` before today (IST). */
function dateAgo(days) {
  const d = new Date(`${todayIST()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** Instant for `days` ago at hh:mm IST — never later than now. */
function instantAgo(days, hh = 13, mm = 0) {
  const [y, m, d] = dateAgo(days).split('-').map(Number);
  const instant = new Date(Date.UTC(y, m - 1, d, hh, mm) - (5 * 60 + 30) * 60 * 1000);
  return instant > new Date() ? new Date(Date.now() - 60_000) : instant;
}

const rupees = (r) => Math.round(r * 100);

/**
 * Adds demo users, groups, expenses, payments, an edit, a delete and a member who
 * left. Requires the base seed (Karan, Priya, Ravi, Ananya) to exist.
 * @param {{ sqlite: import('better-sqlite3').Database, db: object }} ctx
 */
export async function seedDemo(ctx) {
  const passwordHash = await argon2.hash(SEED_PASSWORD, { type: argon2.argon2id });
  const users = {};

  // ── users ─────────────────────────────────────────────────────────────
  for (const key of BASE_USERS) {
    users[key] = ctx.sqlite
      .prepare(`SELECT id, name FROM users WHERE email = ?`)
      .get(`${key}@example.com`);
    if (!users[key]) throw new Error('Run the base seed first (npm run db:reset).');
  }
  atTime(instantAgo(100, 9), () => {
    const now = nowIso();
    for (const [key, name] of NEW_USERS) {
      const id = Number(
        ctx.sqlite
          .prepare(
            `INSERT INTO users (name, email, email_verified_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
          )
          .run(name, `${key}@example.com`, now, now, now).lastInsertRowid,
      );
      ctx.sqlite
        .prepare(
          `INSERT INTO login_methods (user_id, type, password_hash, created_at) VALUES (?, 'password', ?, ?)`,
        )
        .run(id, passwordHash, now);
      users[key] = { id, name };
    }
  });

  // ── helpers ───────────────────────────────────────────────────────────
  const groups = {}; // key → { id, name }
  const events = [];
  const on = (days, hh, mm, run) =>
    events.push({ at: instantAgo(days, hh, mm), order: events.length, run });

  const membership = (g, key) =>
    ctx.sqlite
      .prepare(
        `SELECT id, role FROM memberships WHERE group_id = ? AND user_id = ? AND status = 'active'`,
      )
      .get(groups[g].id, users[key].id);

  const group = (days, key, { by, name, description, members }) =>
    on(days, 10, 0, () => {
      const { groupId } = createGroup(ctx, users[by], {
        name,
        description,
        memberUserIds: members.map((m) => users[m].id),
      });
      groups[key] = { id: groupId, name };
    });

  /** split: 'equal' with list of keys, or [[key, value]] for exact (₹) / percentage (%). */
  const expense = (
    days,
    g,
    { by, payer = by, desc, amount, method = 'equal', split, notes = null, hh = 13, mm = 30 },
  ) =>
    on(days, hh, mm, () =>
      createExpense(ctx, users[by], groups[g], membership(g, by), {
        description: desc,
        notes,
        amountPaise: rupees(amount),
        expenseDate: dateAgo(days),
        payerMembershipId: membership(g, payer).id,
        splitMethod: method,
        participants: split.map((p) =>
          method === 'equal'
            ? { membershipId: membership(g, p).id }
            : method === 'exact'
              ? { membershipId: membership(g, p[0]).id, valuePaise: rupees(p[1]) }
              : { membershipId: membership(g, p[0]).id, valueBp: Math.round(p[1] * 100) },
        ),
        confirm: true,
      }),
    );

  /** Payment `from` → `to`; amount in ₹, or 'all' for whatever is owed at that moment. */
  const pay = (days, g, { from, to, amount, note = 'UPI', by = from, hh = 20, mm = 15 }) =>
    on(days, hh, mm, () => {
      const owed = owedBetween(ctx, groups[g].id, membership(g, from).id, membership(g, to).id);
      const paise =
        amount === 'all' ? owed : amount === 'half' ? Math.round(owed / 2) : rupees(amount);
      if (paise <= 0) return;
      recordSettlement(ctx, users[by], groups[g], membership(g, by), {
        fromMembershipId: membership(g, from).id,
        toMembershipId: membership(g, to).id,
        amountPaise: paise,
        settlementDate: dateAgo(days),
        note,
        confirm: true,
      });
    });

  const monthName = (days) => MONTHS[Number(dateAgo(days).slice(5, 7)) - 1];

  // ── 1. Office Lunch Club — weekly team lunches ───────────────────────
  group(70, 'lunch', {
    by: 'karan',
    name: 'Office Lunch Club',
    description: 'Friday team lunches near the office',
    members: ['priya', 'arjun', 'sneha', 'vikram'],
  });
  const lunchPlaces = [
    'Meghana Foods',
    'Truffles',
    'Empire Restaurant',
    'Toit',
    'MTR',
    'Nagarjuna',
    'Corner House',
    "Brahmin's Coffee Bar",
    "Glen's Bakehouse",
    'Social',
  ];
  const lunchAmounts = [2340, 3120, 1985.5, 2760, 1450, 2899, 1720, 960, 2210, 3450];
  const lunchCrew = ['karan', 'priya', 'arjun', 'sneha', 'vikram'];
  for (let week = 0; week < 10; week++) {
    const days = 66 - week * 7;
    if (days < 0) break;
    const payer = lunchCrew[week % 5];
    const absent = lunchCrew[(week + 2) % 5];
    expense(days, 'lunch', {
      by: payer,
      desc: `Lunch at ${lunchPlaces[week]}`,
      amount: lunchAmounts[week],
      split: week % 3 === 0 ? lunchCrew : lunchCrew.filter((k) => k !== absent),
    });
  }
  expense(45, 'lunch', {
    by: 'sneha',
    desc: 'Birthday cake for Vikram',
    amount: 1200,
    split: ['karan', 'priya', 'arjun', 'sneha'],
    notes: 'Chocolate truffle, 1 kg',
  });
  pay(38, 'lunch', { from: 'arjun', to: 'karan', amount: 'all' });
  pay(30, 'lunch', { from: 'vikram', to: 'priya', amount: 'half', note: 'cash' });
  pay(12, 'lunch', { from: 'sneha', to: 'karan', amount: 'all' });

  // ── 2. Manali Trip — a finished trip with an edit, a delete and someone who left ─
  group(52, 'manali', {
    by: 'priya',
    name: 'Manali Trip 2026',
    description: '5 friends, 5 days in the mountains',
    members: ['karan', 'ravi', 'meera', 'rohan'],
  });
  const five = ['karan', 'priya', 'ravi', 'meera', 'rohan'];
  expense(46, 'manali', {
    by: 'karan',
    desc: 'Volvo bus Delhi → Manali',
    amount: 7500,
    split: five,
    hh: 9,
  });
  expense(45, 'manali', {
    by: 'priya',
    desc: 'Hotel Snow Valley (2 nights)',
    amount: 18000,
    method: 'exact',
    split: [
      ['karan', 4000],
      ['priya', 4000],
      ['ravi', 4000],
      ['meera', 3000],
      ['rohan', 3000],
    ],
    notes: 'Meera and Rohan shared the smaller room',
  });
  expense(44, 'manali', {
    by: 'ravi',
    desc: 'Paragliding at Solang Valley',
    amount: 12500,
    method: 'percentage',
    split: [
      ['karan', 25],
      ['priya', 25],
      ['ravi', 25],
      ['rohan', 25],
    ],
    notes: 'Meera skipped',
  });
  expense(44, 'manali', {
    by: 'meera',
    desc: "Dinner at Johnson's Cafe",
    amount: 4333.33,
    split: five,
    hh: 21,
  });
  expense(43, 'manali', { by: 'rohan', desc: 'Cab to Rohtang Pass', amount: 6000, split: five });
  expense(42, 'manali', {
    by: 'karan',
    desc: 'Momos & chai at Mall Road',
    amount: 860,
    split: five,
    hh: 17,
  });
  expense(42, 'manali', {
    by: 'ravi',
    desc: 'Momos & chai at Mall Road',
    amount: 860,
    split: five,
    hh: 17,
    mm: 40,
  });
  expense(41, 'manali', {
    by: 'priya',
    desc: 'Souvenirs – Tibetan market',
    amount: 2400,
    method: 'exact',
    split: [
      ['priya', 1500],
      ['meera', 900],
    ],
  });
  // Karan forgot the luggage fee → edit (shows in history); Ravi's duplicate → deleted.
  on(40, 11, 0, () => {
    const id = ctx.sqlite
      .prepare(`SELECT id FROM expenses WHERE description = 'Volvo bus Delhi → Manali'`)
      .get().id;
    updateExpense(ctx, users.karan, groups.manali, membership('manali', 'karan'), id, {
      description: 'Volvo bus Delhi → Manali',
      notes: 'Includes ₹750 luggage fee',
      amountPaise: rupees(8250),
      expenseDate: dateAgo(46),
      payerMembershipId: membership('manali', 'karan').id,
      splitMethod: 'equal',
      participants: five.map((k) => ({ membershipId: membership('manali', k).id })),
      confirm: true,
    });
  });
  on(40, 11, 30, () => {
    const id = ctx.sqlite
      .prepare(
        `SELECT id FROM expenses WHERE description = 'Momos & chai at Mall Road' ORDER BY id DESC`,
      )
      .get().id;
    deleteExpense(ctx, users.ravi, groups.manali, membership('manali', 'ravi'), id);
  });
  // Rohan settles every pair and leaves → shows "(left)" and frozen 🔒 expenses.
  on(36, 19, 0, () => {
    const rohan = membership('manali', 'rohan').id;
    for (const p of pairBalances(ctx, groups.manali.id)) {
      if (p.fromMembershipId !== rohan && p.toMembershipId !== rohan) continue;
      const payerKey = Object.keys(users).find(
        (k) => membership('manali', k)?.id === p.fromMembershipId,
      );
      recordSettlement(ctx, users[payerKey], groups.manali, membership('manali', payerKey), {
        fromMembershipId: p.fromMembershipId,
        toMembershipId: p.toMembershipId,
        amountPaise: p.amountPaise,
        settlementDate: dateAgo(36),
        note: 'Settling before I head back',
        confirm: true,
      });
    }
  });
  on(35, 10, 0, () =>
    leaveGroup(ctx, users.rohan, groups.manali, membership('manali', 'rohan'), {}),
  );
  pay(25, 'manali', { from: 'meera', to: 'priya', amount: 'half' });
  pay(5, 'manali', { from: 'ravi', to: 'karan', amount: 'all', note: 'GPay' });

  // ── 3. Flatmates — monthly rent and bills ────────────────────────────
  group(95, 'flat', {
    by: 'ananya',
    name: 'Flatmates – Koramangala',
    description: '3BHK, 5th Block',
    members: ['karan', 'isha', 'meera'],
  });
  const flat = ['ananya', 'karan', 'isha', 'meera'];
  [90, 60, 30, 0].forEach((days, i) => {
    expense(days, 'flat', {
      by: 'ananya',
      desc: `Rent – ${monthName(days)}`,
      amount: 48000,
      method: 'exact',
      split: [
        ['ananya', 14000],
        ['karan', 12000],
        ['isha', 11000],
        ['meera', 11000],
      ],
      notes: 'Ananya has the master bedroom',
      hh: 9,
    });
    if (days >= 30) {
      expense(days - 3, 'flat', {
        by: 'karan',
        desc: `Electricity – ${monthName(days)}`,
        amount: [2134.5, 2410, 1987.25][i],
        split: flat,
      });
      expense(days - 5, 'flat', {
        by: 'isha',
        desc: 'Wi-Fi (ACT Fibernet)',
        amount: 1179,
        split: flat,
      });
      expense(days - 1, 'flat', { by: 'meera', desc: 'Maid salary', amount: 6000, split: flat });
      for (const who of ['karan', 'meera', ...(days > 30 ? ['isha'] : [])]) {
        pay(days - 2, 'flat', {
          from: who,
          to: 'ananya',
          amount: who === 'karan' ? 12000 : 11000,
          note: 'Rent',
        });
      }
    }
  });
  [85, 74, 63, 52, 41, 29, 18, 8, 2].forEach((days, i) =>
    expense(days, 'flat', {
      by: flat[i % 4],
      desc: 'Groceries – BigBasket',
      amount: [2350, 3120.4, 1875, 2760, 3399, 1920.75, 2580, 3105, 1460][i],
      split: flat,
      hh: 19,
    }),
  );
  pay(20, 'flat', { from: 'isha', to: 'karan', amount: 'all' });

  // ── 4. Mom's Birthday Gift — fully settled ───────────────────────────
  group(26, 'gift', {
    by: 'karan',
    name: "Mom's Birthday Gift",
    description: 'Surprise for Mom',
    members: ['ravi', 'ananya'],
  });
  expense(24, 'gift', {
    by: 'karan',
    desc: 'Kanjeevaram saree from Nalli',
    amount: 9000,
    split: ['karan', 'ravi', 'ananya'],
  });
  expense(23, 'gift', {
    by: 'ananya',
    desc: 'Cake and flowers',
    amount: 1650,
    split: ['karan', 'ravi', 'ananya'],
  });
  pay(22, 'gift', { from: 'ravi', to: 'karan', amount: 'all' });
  pay(21, 'gift', { from: 'ravi', to: 'ananya', amount: 'all' });
  pay(21, 'gift', { from: 'ananya', to: 'karan', amount: 'all', hh: 21 });

  // ── 5. Weekend Cricket — recent and active ───────────────────────────
  group(40, 'cricket', {
    by: 'vikram',
    name: 'Weekend Cricket',
    description: 'Saturday morning turf games',
    members: ['karan', 'rohan', 'arjun', 'ravi'],
  });
  const players = ['vikram', 'karan', 'rohan', 'arjun', 'ravi'];
  [35, 28, 21, 14, 7, 0].forEach((days, i) =>
    expense(days, 'cricket', {
      by: players[i % 5],
      desc: 'Turf booking – Saturday',
      amount: 3000,
      split: i === 3 ? players.filter((p) => p !== 'rohan') : players,
      hh: 8,
    }),
  );
  expense(33, 'cricket', {
    by: 'arjun',
    desc: 'Cricket balls (pack of 6)',
    amount: 1200,
    split: players,
    notes: 'Leather, red',
  });
  pay(15, 'cricket', { from: 'karan', to: 'vikram', amount: 'all' });

  // Late joiner shows up in activity.
  on(20, 18, 0, () =>
    addMember(ctx, users.vikram, groups.cricket, membership('cricket', 'vikram'), users.sneha.id),
  );
  expense(14, 'cricket', {
    by: 'sneha',
    desc: 'Energy drinks',
    amount: 540,
    split: [...players, 'sneha'],
    hh: 10,
  });

  // ── run in date order ────────────────────────────────────────────────
  events.sort((a, b) => a.at - b.at || a.order - b.order);
  for (const event of events) atTime(event.at, event.run);

  // Older notifications have been seen; the last week's stay unread for the bell.
  ctx.sqlite
    .prepare(`UPDATE notifications SET read_at = created_at WHERE created_at < ?`)
    .run(instantAgo(7, 0).toISOString());

  return { users: Object.keys(users).length, groups: Object.keys(groups).length };
}
