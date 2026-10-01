import { describe, expect, it } from 'vitest';
import {
  bpToPercentString,
  formatPaise,
  paiseToRupeesString,
  percentToBp,
  rupeesToPaise,
} from './money.js';

describe('rupeesToPaise', () => {
  it.each([
    ['1200', 120000],
    ['1200.5', 120050],
    ['1200.50', 120050],
    ['0.01', 1],
    ['1,20,000.00', 12000000],
    ['  45 ', 4500],
    [1200.5, 120050],
    [0.1 + 0.2, null], // 0.30000000000000004 has more than 2 decimals
  ])('%j → %j', (input, expected) => {
    expect(rupeesToPaise(input)).toBe(expected);
  });

  it.each(['', 'abc', '-5', '1.234', '1.2.3', '.5', '1e3', null, undefined, NaN, Infinity])(
    'rejects %j',
    (input) => {
      expect(rupeesToPaise(input)).toBeNull();
    },
  );

  it('accepts zero (positivity is checked by schemas, not parsing)', () => {
    expect(rupeesToPaise('0')).toBe(0);
  });

  it('rejects values beyond the safe integer range', () => {
    expect(rupeesToPaise('99999999999999999')).toBeNull();
  });
});

describe('formatPaise', () => {
  it.each([
    [0, '₹0.00'],
    [1, '₹0.01'],
    [120000, '₹1,200.00'],
    [12000000, '₹1,20,000.00'],
    [1234567890, '₹1,23,45,678.90'],
    [-35000, '-₹350.00'],
  ])('%i → %s', (paise, expected) => {
    expect(formatPaise(paise)).toBe(expected);
  });

  it('can omit the symbol', () => {
    expect(formatPaise(120050, { symbol: false })).toBe('1,200.50');
  });
});

describe('paiseToRupeesString', () => {
  it.each([
    [0, '0.00'],
    [5, '0.05'],
    [120050, '1200.50'],
    [-35000, '-350.00'],
  ])('%i → %s', (paise, expected) => {
    expect(paiseToRupeesString(paise)).toBe(expected);
  });
});

describe('percentToBp / bpToPercentString', () => {
  it.each([
    ['33.33', 3333],
    ['50', 5000],
    ['100', 10000],
    ['0.01', 1],
    ['12.5', 1250],
  ])('%s → %i', (input, bp) => {
    expect(percentToBp(input)).toBe(bp);
  });

  it.each(['', '-1', '100.01', '33.333', 'x'])('rejects %j', (input) => {
    expect(percentToBp(input)).toBeNull();
  });

  it.each([
    [3333, '33.33'],
    [10000, '100.00'],
    [1, '0.01'],
  ])('%i → %s', (bp, expected) => {
    expect(bpToPercentString(bp)).toBe(expected);
  });
});
