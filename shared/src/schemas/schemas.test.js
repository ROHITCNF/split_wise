import { describe, expect, it } from 'vitest';
import { todayIST } from '../dates.js';
import {
  createGroupBody,
  expenseBody,
  expenseListQuery,
  leaveGroupBody,
  notificationListQuery,
  reportQuery,
  settlementBody,
  signupBody,
  toFieldErrors,
  updateGroupBody,
  userSearchQuery,
} from './index.js';

const tomorrow = () => {
  const d = new Date(`${todayIST()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

const validExpense = {
  description: 'Dinner at Thalassa',
  amountPaise: 120000,
  expenseDate: '2026-09-30',
  payerMembershipId: 12,
  splitMethod: 'percentage',
  participants: [
    { membershipId: 12, valueBp: 5000 },
    { membershipId: 14, valueBp: 5000 },
  ],
};

const fieldErrorsOf = (schema, input) => {
  const result = schema.safeParse(input);
  expect(result.success).toBe(false);
  return toFieldErrors(result.error);
};

describe('signupBody', () => {
  it('trims name and lower-cases email', () => {
    expect(
      signupBody.parse({ name: '  Karan ', email: ' Karan@Example.COM ', password: 'secret12' }),
    ).toEqual({ name: 'Karan', email: 'karan@example.com', password: 'secret12' });
  });

  it.each([
    ['short password', { name: 'K', email: 'k@x.io', password: 'short' }, 'password'],
    ['long password', { name: 'K', email: 'k@x.io', password: 'x'.repeat(129) }, 'password'],
    ['bad email', { name: 'K', email: 'nope', password: 'secret12' }, 'email'],
    ['long name', { name: 'x'.repeat(61), email: 'k@x.io', password: 'secret12' }, 'name'],
    ['unknown field', { name: 'K', email: 'k@x.io', password: 'secret12', admin: true }, '_'],
  ])('rejects %s', (_label, input, field) => {
    expect(fieldErrorsOf(signupBody, input).fieldErrors).toHaveProperty(field);
  });
});

describe('expenseBody', () => {
  it('accepts a valid percentage expense and fills defaults', () => {
    expect(expenseBody.parse(validExpense)).toMatchObject({ notes: null, confirm: false });
  });

  it('turns blank notes into null', () => {
    expect(expenseBody.parse({ ...validExpense, notes: '   ' }).notes).toBeNull();
  });

  it('enforces description 1–100 and notes ≤ 500 (FR-EXP-14)', () => {
    expect(
      fieldErrorsOf(expenseBody, { ...validExpense, description: 'x'.repeat(101) }).fieldErrors,
    ).toHaveProperty('description');
    expect(
      fieldErrorsOf(expenseBody, { ...validExpense, description: '  ' }).fieldErrors,
    ).toHaveProperty('description');
    expect(
      fieldErrorsOf(expenseBody, { ...validExpense, notes: 'x'.repeat(501) }).fieldErrors,
    ).toHaveProperty('notes');
  });

  it('rejects zero, negative and fractional amounts', () => {
    for (const amountPaise of [0, -100, 10.5]) {
      expect(
        fieldErrorsOf(expenseBody, { ...validExpense, amountPaise }).fieldErrors,
      ).toHaveProperty('amountPaise');
    }
  });

  it('E23: future date gives FUTURE_DATE', () => {
    expect(fieldErrorsOf(expenseBody, { ...validExpense, expenseDate: tomorrow() })).toEqual({
      code: 'FUTURE_DATE',
      fieldErrors: { expenseDate: expect.any(String) },
    });
  });

  it('accepts today', () => {
    expect(expenseBody.safeParse({ ...validExpense, expenseDate: todayIST() }).success).toBe(true);
  });

  it('requires the value that matches the split method', () => {
    const errors = fieldErrorsOf(expenseBody, {
      ...validExpense,
      splitMethod: 'exact',
    }).fieldErrors;
    expect(errors).toHaveProperty(['participants.0.valuePaise']);
    expect(errors).toHaveProperty(['participants.0.valueBp']);
  });

  it('equal split takes no values', () => {
    expect(
      expenseBody.safeParse({
        ...validExpense,
        splitMethod: 'equal',
        participants: [{ membershipId: 12 }, { membershipId: 14 }],
      }).success,
    ).toBe(true);
  });

  it('rejects duplicate and missing participants', () => {
    expect(
      fieldErrorsOf(expenseBody, {
        ...validExpense,
        participants: [
          { membershipId: 12, valueBp: 5000 },
          { membershipId: 12, valueBp: 5000 },
        ],
      }).fieldErrors,
    ).toHaveProperty('participants');
    expect(
      fieldErrorsOf(expenseBody, { ...validExpense, participants: [] }).fieldErrors,
    ).toHaveProperty('participants');
  });
});

describe('expenseListQuery', () => {
  it('coerces query strings and applies paging defaults', () => {
    expect(expenseListQuery.parse({ amountPaise: '120000', page: '2' })).toEqual({
      amountPaise: 120000,
      page: 2,
      pageSize: 20,
    });
  });

  it('caps page size at 100', () => {
    expect(fieldErrorsOf(expenseListQuery, { pageSize: '101' }).fieldErrors).toHaveProperty(
      'pageSize',
    );
  });
});

describe('settlementBody', () => {
  it('accepts a payment and normalises the note', () => {
    expect(
      settlementBody.parse({
        fromMembershipId: 14,
        toMembershipId: 12,
        amountPaise: 35000,
        settlementDate: '2026-10-01',
        note: ' UPI ',
      }),
    ).toEqual({
      fromMembershipId: 14,
      toMembershipId: 12,
      amountPaise: 35000,
      settlementDate: '2026-10-01',
      note: 'UPI',
      confirm: false,
    });
  });

  it('E13: amount must be > 0; note ≤ 200 (S-3)', () => {
    const base = { fromMembershipId: 1, toMembershipId: 2, settlementDate: '2026-10-01' };
    expect(fieldErrorsOf(settlementBody, { ...base, amountPaise: 0 }).fieldErrors).toHaveProperty(
      'amountPaise',
    );
    expect(
      fieldErrorsOf(settlementBody, { ...base, amountPaise: 1, note: 'x'.repeat(201) }).fieldErrors,
    ).toHaveProperty('note');
  });
});

describe('groups', () => {
  it('create needs at least one other member, no duplicates (FR-GRP-02)', () => {
    expect(
      fieldErrorsOf(createGroupBody, { name: 'Trip', memberUserIds: [] }).fieldErrors,
    ).toHaveProperty('memberUserIds');
    expect(
      fieldErrorsOf(createGroupBody, { name: 'Trip', memberUserIds: [2, 2] }).fieldErrors,
    ).toHaveProperty('memberUserIds');
  });

  it('update needs at least one field; blank description clears it', () => {
    expect(updateGroupBody.safeParse({}).success).toBe(false);
    expect(updateGroupBody.parse({ description: '' })).toEqual({ description: null });
  });

  it('leave accepts member, transfer and delete shapes', () => {
    expect(leaveGroupBody.parse({})).toEqual({});
    expect(leaveGroupBody.parse({ mode: 'transfer', newAdminMembershipId: 4 })).toEqual({
      mode: 'transfer',
      newAdminMembershipId: 4,
    });
    expect(leaveGroupBody.parse({ mode: 'delete' })).toEqual({ mode: 'delete', confirm: false });
    expect(leaveGroupBody.safeParse({ mode: 'transfer' }).success).toBe(false);
  });

  it('user search needs 2–60 characters', () => {
    expect(userSearchQuery.safeParse({ q: 'p' }).success).toBe(false);
    expect(userSearchQuery.parse({ q: 'pri', groupId: '3' })).toEqual({ q: 'pri', groupId: 3 });
  });
});

describe('misc queries', () => {
  it('notification unreadOnly parses "true"', () => {
    expect(notificationListQuery.parse({ unreadOnly: 'true' })).toMatchObject({ unreadOnly: true });
    expect(notificationListQuery.parse({})).toMatchObject({ unreadOnly: false });
  });

  it('report period must be week or month', () => {
    expect(reportQuery.safeParse({ period: 'year' }).success).toBe(false);
    expect(reportQuery.parse({ period: 'week', date: '2026-10-01' })).toEqual({
      period: 'week',
      date: '2026-10-01',
    });
  });
});
