import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { todayIST, weekRange } from '@splitbook/shared';
import {
  createGroup,
  createTestApp,
  createUser,
  loginCookie,
  TEST_ORIGIN,
} from '../../test/helpers.js';
import { csvCell, reportToCsv } from './csv.js';

let ctx, app, users, trip, flat, cookies;

beforeEach(async () => {
  ({ ctx, app } = createTestApp());
  users = {
    karan: createUser(ctx, { name: 'Karan Mehta' }),
    priya: createUser(ctx, { name: 'Priya Sharma' }),
    ananya: createUser(ctx, { name: 'Ananya Iyer' }),
  };
  cookies = Object.fromEntries(Object.entries(users).map(([k, id]) => [k, loginCookie(ctx, id)]));
  trip = createGroup(ctx, {
    name: 'Trip Goa',
    adminUserId: users.karan,
    memberUserIds: [users.priya],
  });
  flat = createGroup(ctx, {
    name: 'Flat 302',
    adminUserId: users.ananya,
    memberUserIds: [users.karan],
  });

  const mk = (g) => (u) => g.memberships[users[u]];
  const t = mk(trip);
  const f = mk(flat);
  // Week of 31 Aug – 6 Sep 2026 spans two months (all dates before 'today' = 1 Oct 2026).
  await expense('priya', trip, {
    description: 'Dinner, with "tip"',
    amountPaise: 120000,
    expenseDate: '2026-08-31',
    payerMembershipId: t('priya'),
    participants: [t('karan'), t('priya')],
  });
  await expense('karan', trip, {
    description: 'Scooter',
    amountPaise: 150000,
    expenseDate: '2026-09-02',
    payerMembershipId: t('karan'),
    participants: [t('karan'), t('priya')],
  });
  await expense('karan', trip, {
    description: '=HYPERLINK("x")',
    amountPaise: 6000,
    expenseDate: '2026-09-06',
    payerMembershipId: t('karan'),
    participants: [t('karan')],
  }); // FR-SPL-05
  await expense('ananya', flat, {
    description: 'Rent',
    amountPaise: 2000000,
    expenseDate: '2026-09-07',
    payerMembershipId: f('ananya'),
    participants: [f('ananya'), f('karan')],
  }); // next week
  await expense('ananya', flat, {
    description: 'Not mine',
    amountPaise: 1000,
    expenseDate: '2026-09-01',
    payerMembershipId: f('ananya'),
    participants: [f('ananya')],
  });
  const paid = await as('karan').send('post', `/api/groups/${trip.groupId}/settlements`, {
    fromMembershipId: t('karan'),
    toMembershipId: t('priya'),
    amountPaise: 35000,
    settlementDate: '2026-09-01',
    note: 'UPI',
    confirm: true, // Priya actually owes Karan here, so this is an over-payment
  });
  expect(paid.status).toBe(201);
});

const as = (who) => ({
  get: (url) => request(app).get(url).set('Cookie', cookies[who]),
  send: (method, url, body) =>
    request(app)[method](url).set('Origin', TEST_ORIGIN).set('Cookie', cookies[who]).send(body),
});

async function expense(who, group, { participants, ...rest }) {
  const res = await as(who).send('post', `/api/groups/${group.groupId}/expenses`, {
    splitMethod: 'equal',
    participants: participants.map((membershipId) => ({ membershipId })),
    ...rest,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
}

describe('R1 weekly / monthly report', () => {
  it('week across two months: totals, rows newest first (FR-RPT-01..05)', async () => {
    const res = await as('karan').get('/api/reports?period=week&date=2026-09-01');
    expect(res.status).toBe(200);
    expect(res.body.period).toEqual({
      type: 'week',
      from: '2026-08-31',
      to: '2026-09-06',
      label: '31 Aug – 6 Sep 2026',
    });
    expect(res.body.totals).toEqual({
      paidPaise: 156000, // scooter 1,500 + water 60
      mySharePaise: 60000 + 75000 + 6000,
      settlementsPaidPaise: 35000,
      settlementsReceivedPaise: 0,
    });
    expect(res.body.expenses.map((e) => [e.date, e.description, e.mySharePaise])).toEqual([
      ['2026-09-06', '=HYPERLINK("x")', 6000],
      ['2026-09-02', 'Scooter', 75000],
      ['2026-08-31', 'Dinner, with "tip"', 60000],
    ]);
    expect(res.body.settlements).toEqual([
      expect.objectContaining({
        date: '2026-09-01',
        groupName: 'Trip Goa',
        amountPaise: 35000,
        note: 'UPI',
        from: expect.objectContaining({ name: 'Karan Mehta' }),
      }),
    ]);
  });

  it('expenses I neither paid nor share in are excluded', async () => {
    const res = await as('karan').get('/api/reports?period=month&date=2026-09-15');
    expect(res.body.expenses.map((e) => e.description)).not.toContain('Not mine');
  });

  it('month: calendar boundaries, by expense date', async () => {
    const sep = await as('karan').get('/api/reports?period=month&date=2026-09-30');
    expect(sep.body.period).toMatchObject({
      from: '2026-09-01',
      to: '2026-09-30',
      label: 'September 2026',
    });
    expect(sep.body.expenses.map((e) => e.description)).toEqual([
      'Rent',
      '=HYPERLINK("x")',
      'Scooter',
    ]);
    const aug = await as('karan').get('/api/reports?period=month&date=2026-08-01');
    expect(aug.body.expenses.map((e) => e.description)).toEqual(['Dinner, with "tip"']);
  });

  it('receiver sees the payment as received', async () => {
    const res = await as('priya').get('/api/reports?period=week&date=2026-09-01');
    expect(res.body.totals).toMatchObject({
      settlementsPaidPaise: 0,
      settlementsReceivedPaise: 35000,
    });
  });

  it('group filter; a group I am not in → 404', async () => {
    const res = await as('karan').get(
      `/api/reports?period=month&date=2026-09-15&groupId=${flat.groupId}`,
    );
    expect(res.body.groupId).toBe(flat.groupId);
    expect(res.body.expenses.map((e) => e.groupName)).toEqual(['Flat 302']);
    expect((await as('priya').get(`/api/reports?period=week&groupId=${flat.groupId}`)).status).toBe(
      404,
    );
  });

  it('E26: an expense added later for a past week shows up in that week', async () => {
    const t = (u) => trip.memberships[users[u]];
    await expense('karan', trip, {
      description: 'Late entry',
      amountPaise: 1000,
      expenseDate: '2026-08-31',
      payerMembershipId: t('karan'),
      participants: [t('karan')],
    });
    const res = await as('karan').get('/api/reports?period=week&date=2026-09-01');
    expect(res.body.expenses.map((e) => e.description)).toContain('Late entry');
  });

  it('date defaults to today (IST); deleted expenses excluded', async () => {
    const res = await as('karan').get('/api/reports?period=week');
    expect(res.body.period).toMatchObject(weekRange(todayIST()));
  });

  it('period is required', async () => {
    expect((await as('karan').get('/api/reports')).status).toBe(400);
  });
});

describe('R2 CSV', () => {
  it('download with filename, BOM, header and escaped rows (E25)', async () => {
    const res = await as('karan')
      .get('/api/reports/csv?period=week&date=2026-09-01')
      .buffer(true)
      .parse((r, cb) => {
        let data = '';
        r.setEncoding('utf8');
        r.on('data', (c) => (data += c));
        r.on('end', () => cb(null, data));
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="report-week-2026-08-31.csv"',
    );
    expect(res.body.startsWith('﻿')).toBe(true);
    expect(res.body.slice(1).split('\r\n')).toEqual([
      'Date,Group,Type,Description,Payer,Total Amount (INR),My Share (INR),Split Method',
      '2026-08-31,Trip Goa,expense,"Dinner, with ""tip""",Priya Sharma,1200.00,600.00,equal',
      '2026-09-01,Trip Goa,settlement,UPI,Karan Mehta,350.00,,',
      '2026-09-02,Trip Goa,expense,Scooter,Karan Mehta,1500.00,750.00,equal',
      `2026-09-06,Trip Goa,expense,"'=HYPERLINK(""x"")",Karan Mehta,60.00,60.00,equal`,
      '',
    ]);
  });
});

describe('csvCell', () => {
  it.each([
    ['plain', 'plain'],
    ['a,b', '"a,b"'],
    ['say "hi"', '"say ""hi"""'],
    ['line\nbreak', '"line\nbreak"'],
    ['=1+1', "'=1+1"],
    ['+91 98', "'+91 98"],
    ['-5', "'-5"],
    ['@cmd', "'@cmd"],
    [null, ''],
    ['₹ नमस्ते', '₹ नमस्ते'],
  ])('%j → %j', (input, output) => {
    expect(csvCell(input)).toBe(output);
  });

  it('empty report is just the header', () => {
    expect(reportToCsv({ expenses: [], settlements: [] }).split('\r\n')).toHaveLength(2);
  });
});
