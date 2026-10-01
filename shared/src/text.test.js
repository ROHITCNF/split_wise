import { describe, expect, it } from 'vitest';
import { truncate } from './text.js';

describe('truncate (FR-EXP-14: 40 chars in lists)', () => {
  it('keeps short text', () => {
    expect(truncate('Dinner', 40)).toBe('Dinner');
    expect(truncate('x'.repeat(40), 40)).toBe('x'.repeat(40));
  });

  it('cuts long text to the limit including the ellipsis', () => {
    const out = truncate('Scooter rental for three days from the beach shack', 40);
    expect(out).toBe('Scooter rental for three days from the…');
    expect([...out].length).toBeLessThanOrEqual(40);
  });

  it('counts characters, not UTF-16 units', () => {
    expect(truncate('₹'.repeat(41), 40)).toBe(`${'₹'.repeat(39)}…`);
    expect(truncate('😀'.repeat(41), 40)).toBe(`${'😀'.repeat(39)}…`);
  });

  it('handles null', () => {
    expect(truncate(null, 40)).toBe('');
  });
});
