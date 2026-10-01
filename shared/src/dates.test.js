import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatDateTime,
  isFutureDate,
  isValidDateString,
  monthRange,
  todayIST,
  weekRange,
} from './dates.js';

describe('todayIST', () => {
  it('uses the IST calendar day, not UTC', () => {
    // 2026-09-30 19:00 UTC = 2026-10-01 00:30 IST
    expect(todayIST(new Date('2026-09-30T19:00:00Z'))).toBe('2026-10-01');
    // 2026-09-30 18:29 UTC = 2026-09-30 23:59 IST
    expect(todayIST(new Date('2026-09-30T18:29:00Z'))).toBe('2026-09-30');
  });
});

describe('isValidDateString', () => {
  it.each(['2026-10-01', '2024-02-29', '2026-12-31'])('accepts %s', (s) => {
    expect(isValidDateString(s)).toBe(true);
  });

  it.each(['2026-02-29', '2026-13-01', '2026-10-32', '2026-1-1', '01-10-2026', '', null, 20261001])(
    'rejects %j',
    (s) => {
      expect(isValidDateString(s)).toBe(false);
    },
  );
});

describe('isFutureDate', () => {
  const now = new Date('2026-09-30T19:00:00Z'); // 1 Oct 2026, 00:30 IST

  it('today in IST is not future', () => {
    expect(isFutureDate('2026-10-01', now)).toBe(false);
  });

  it('past is not future', () => {
    expect(isFutureDate('2026-09-30', now)).toBe(false);
  });

  it('tomorrow in IST is future', () => {
    expect(isFutureDate('2026-10-02', now)).toBe(true);
  });
});

describe('weekRange (Mon–Sun)', () => {
  it.each([
    ['2026-10-01', '2026-09-28', '2026-10-04'], // Thursday
    ['2026-09-28', '2026-09-28', '2026-10-04'], // Monday
    ['2026-10-04', '2026-09-28', '2026-10-04'], // Sunday
    ['2026-12-31', '2026-12-28', '2027-01-03'], // across years
  ])('%s → %s..%s', (date, from, to) => {
    expect(weekRange(date)).toEqual({ from, to });
  });
});

describe('monthRange', () => {
  it.each([
    ['2026-10-15', '2026-10-01', '2026-10-31'],
    ['2026-02-10', '2026-02-01', '2026-02-28'],
    ['2028-02-10', '2028-02-01', '2028-02-29'],
    ['2026-12-31', '2026-12-01', '2026-12-31'],
  ])('%s → %s..%s', (date, from, to) => {
    expect(monthRange(date)).toEqual({ from, to });
  });
});

describe('formatting', () => {
  it('formats a calendar date', () => {
    expect(formatDate('2026-09-30')).toBe('30 Sep 2026');
  });

  it('formats a UTC instant in IST, 24-hour', () => {
    expect(formatDateTime('2026-09-30T16:15:00.000Z')).toBe('30 Sep 2026, 21:45');
    expect(formatDateTime('2026-09-30T19:00:00.000Z')).toBe('1 Oct 2026, 00:30');
  });
});
