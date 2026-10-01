import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { computeShares, splitSummary } from './split.js';

const P = (membershipId, extra = {}) => ({ membershipId, ...extra });
const amounts = (result) => result.shares.map((s) => [s.membershipId, s.sharePaise]);

describe('computeShares — equal (FR-SPL-01)', () => {
  it('E1: ₹100 among 3, payer participates → payer absorbs ₹0.01', () => {
    const r = computeShares({
      amountPaise: 10000,
      splitMethod: 'equal',
      payerMembershipId: 2,
      participants: [P(1), P(2), P(3)],
    });
    expect(r.ok).toBe(true);
    expect(amounts(r)).toEqual([
      [1, 3333],
      [2, 3334],
      [3, 3333],
    ]);
  });

  it('E1a: payer not a participant → first participant absorbs', () => {
    const r = computeShares({
      amountPaise: 10000,
      splitMethod: 'equal',
      payerMembershipId: 9,
      participants: [P(3), P(1), P(2)],
    });
    expect(amounts(r)).toEqual([
      [3, 3334],
      [1, 3333],
      [2, 3333],
    ]);
  });

  it('even split has no remainder', () => {
    const r = computeShares({
      amountPaise: 120000,
      splitMethod: 'equal',
      payerMembershipId: 1,
      participants: [P(1), P(2), P(3)],
    });
    expect(amounts(r)).toEqual([
      [1, 40000],
      [2, 40000],
      [3, 40000],
    ]);
  });

  it('records position in participant order', () => {
    const r = computeShares({
      amountPaise: 300,
      splitMethod: 'equal',
      payerMembershipId: 1,
      participants: [P(5), P(1)],
    });
    expect(r.shares.map((s) => s.position)).toEqual([0, 1]);
  });

  it('rejects an amount too small to give everyone at least ₹0.01', () => {
    const r = computeShares({
      amountPaise: 2,
      splitMethod: 'equal',
      payerMembershipId: 1,
      participants: [P(1), P(2), P(3)],
    });
    expect(r).toMatchObject({ ok: false, code: 'VALIDATION_ERROR' });
    expect(r.fieldErrors.amountPaise).toBeDefined();
  });
});

describe('computeShares — exact (FR-SPL-02)', () => {
  it('accepts amounts that sum to the total', () => {
    const r = computeShares({
      amountPaise: 110000,
      splitMethod: 'exact',
      payerMembershipId: 1,
      participants: [
        P(1, { valuePaise: 50000 }),
        P(2, { valuePaise: 40000 }),
        P(3, { valuePaise: 20000 }),
      ],
    });
    expect(amounts(r)).toEqual([
      [1, 50000],
      [2, 40000],
      [3, 20000],
    ]);
    expect(r.shares[0].inputPaise).toBe(50000);
  });

  it('E3: sum below total is blocked', () => {
    const r = computeShares({
      amountPaise: 120000,
      splitMethod: 'exact',
      payerMembershipId: 1,
      participants: [P(1, { valuePaise: 50000 }), P(2, { valuePaise: 60000 })],
    });
    expect(r).toEqual({
      ok: false,
      code: 'SPLIT_SUM_MISMATCH',
      details: { differencePaise: 10000 },
    });
  });

  it('E4: sum above total is blocked', () => {
    const r = computeShares({
      amountPaise: 100000,
      splitMethod: 'exact',
      payerMembershipId: 1,
      participants: [P(1, { valuePaise: 50000 }), P(2, { valuePaise: 55000 })],
    });
    expect(r).toEqual({
      ok: false,
      code: 'SPLIT_SUM_MISMATCH',
      details: { differencePaise: -5000 },
    });
  });
});

describe('computeShares — percentage (FR-SPL-03)', () => {
  it('splits by basis points', () => {
    const r = computeShares({
      amountPaise: 120000,
      splitMethod: 'percentage',
      payerMembershipId: 1,
      participants: [P(1, { valueBp: 5000 }), P(2, { valueBp: 2500 }), P(3, { valueBp: 2500 })],
    });
    expect(amounts(r)).toEqual([
      [1, 60000],
      [2, 30000],
      [3, 30000],
    ]);
    expect(r.shares[1].inputBp).toBe(2500);
  });

  it('E2: rupee rounding remainder goes to payer', () => {
    // ₹100 at 33.33 / 33.33 / 33.34 → 33.33, 33.33, 33.34 exactly; use ₹10 instead
    const r = computeShares({
      amountPaise: 1000,
      splitMethod: 'percentage',
      payerMembershipId: 3,
      participants: [P(1, { valueBp: 3333 }), P(2, { valueBp: 3333 }), P(3, { valueBp: 3334 })],
    });
    // floors: 333, 333, 333 → remainder 1 paisa → payer (3)
    expect(amounts(r)).toEqual([
      [1, 333],
      [2, 333],
      [3, 334],
    ]);
  });

  it('E2/E1a: remainder goes to first participant when payer not participating', () => {
    const r = computeShares({
      amountPaise: 1000,
      splitMethod: 'percentage',
      payerMembershipId: 9,
      participants: [P(2, { valueBp: 3333 }), P(1, { valueBp: 3333 }), P(3, { valueBp: 3334 })],
    });
    expect(amounts(r)).toEqual([
      [2, 334],
      [1, 333],
      [3, 333],
    ]);
  });

  it('decimal percentages are allowed', () => {
    const r = computeShares({
      amountPaise: 100000,
      splitMethod: 'percentage',
      payerMembershipId: 1,
      participants: [P(1, { valueBp: 1250 }), P(2, { valueBp: 8750 })],
    });
    expect(amounts(r)).toEqual([
      [1, 12500],
      [2, 87500],
    ]);
  });

  it('E5: total not equal to 100% is blocked', () => {
    const r = computeShares({
      amountPaise: 100000,
      splitMethod: 'percentage',
      payerMembershipId: 1,
      participants: [P(1, { valueBp: 5000 }), P(2, { valueBp: 4000 })],
    });
    expect(r).toEqual({ ok: false, code: 'PERCENT_SUM_MISMATCH', details: { differenceBp: 1000 } });
  });

  it('handles very large amounts without precision loss', () => {
    const amountPaise = Number.MAX_SAFE_INTEGER - 1; // even
    const r = computeShares({
      amountPaise,
      splitMethod: 'percentage',
      payerMembershipId: 1,
      participants: [P(1, { valueBp: 5000 }), P(2, { valueBp: 5000 })],
    });
    expect(r.ok).toBe(true);
    expect(r.shares[0].sharePaise + r.shares[1].sharePaise).toBe(amountPaise);
  });
});

describe('computeShares — participants (FR-SPL-04/05)', () => {
  it('E6: zero-value participants are dropped, positions re-numbered', () => {
    const r = computeShares({
      amountPaise: 100000,
      splitMethod: 'exact',
      payerMembershipId: 1,
      participants: [P(1, { valuePaise: 0 }), P(2, { valuePaise: 100000 })],
    });
    expect(r.shares).toEqual([
      { membershipId: 2, sharePaise: 100000, inputPaise: 100000, inputBp: null, position: 0 },
    ]);
  });

  it('E6: 0% participants are dropped', () => {
    const r = computeShares({
      amountPaise: 100000,
      splitMethod: 'percentage',
      payerMembershipId: 1,
      participants: [P(1, { valueBp: 10000 }), P(2, { valueBp: 0 })],
    });
    expect(amounts(r)).toEqual([[1, 100000]]);
  });

  it('E7: payer as the only participant is allowed', () => {
    const r = computeShares({
      amountPaise: 6000,
      splitMethod: 'equal',
      payerMembershipId: 1,
      participants: [P(1)],
    });
    expect(amounts(r)).toEqual([[1, 6000]]);
  });

  it('rejects no participants (or all zero)', () => {
    expect(
      computeShares({
        amountPaise: 100,
        splitMethod: 'equal',
        payerMembershipId: 1,
        participants: [],
      }),
    ).toMatchObject({ ok: false, code: 'VALIDATION_ERROR' });
    expect(
      computeShares({
        amountPaise: 100,
        splitMethod: 'exact',
        payerMembershipId: 1,
        participants: [P(1, { valuePaise: 0 })],
      }),
    ).toMatchObject({ ok: false, code: 'VALIDATION_ERROR' });
  });

  it('rejects duplicate participants', () => {
    expect(
      computeShares({
        amountPaise: 100,
        splitMethod: 'equal',
        payerMembershipId: 1,
        participants: [P(1), P(1)],
      }),
    ).toMatchObject({ ok: false, code: 'VALIDATION_ERROR' });
  });

  it('rejects a non-positive amount', () => {
    expect(
      computeShares({
        amountPaise: 0,
        splitMethod: 'equal',
        payerMembershipId: 1,
        participants: [P(1)],
      }),
    ).toMatchObject({ ok: false, code: 'VALIDATION_ERROR' });
  });
});

describe('computeShares — invariants (property)', () => {
  it('Σ shares === amount, every share > 0, order preserved', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000_000 }),
        fc.integer({ min: 1, max: 20 }),
        fc.integer({ min: 0, max: 25 }),
        (amountPaise, n, payerIndex) => {
          const ids = Array.from({ length: n }, (_, i) => i + 1);
          const r = computeShares({
            amountPaise,
            splitMethod: 'equal',
            payerMembershipId: payerIndex + 1,
            participants: ids.map((id) => P(id)),
          });
          if (amountPaise < n) return !r.ok;
          const sum = r.shares.reduce((a, s) => a + s.sharePaise, 0);
          return (
            r.ok &&
            sum === amountPaise &&
            r.shares.every((s) => s.sharePaise > 0) &&
            r.shares.map((s) => s.membershipId).join() === ids.join()
          );
        },
      ),
    );
  });

  it('percentage split always sums to the amount when percentages sum to 100', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 10_000, max: 1_000_000_000 }),
        fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 1, maxLength: 10 }),
        (amountPaise, weights) => {
          // Turn weights into basis points summing to exactly 10000.
          const total = weights.reduce((a, b) => a + b, 0);
          const bps = weights.map((w) => Math.floor((w * 10000) / total));
          bps[0] += 10000 - bps.reduce((a, b) => a + b, 0);
          if (bps.some((b) => b <= 0)) return true;
          const r = computeShares({
            amountPaise,
            splitMethod: 'percentage',
            payerMembershipId: 1,
            participants: bps.map((valueBp, i) => P(i + 1, { valueBp })),
          });
          if (!r.ok) return r.code === 'VALIDATION_ERROR'; // a share rounded to 0
          return r.shares.reduce((a, s) => a + s.sharePaise, 0) === amountPaise;
        },
      ),
    );
  });
});

describe('splitSummary — live form feedback (FR-SPL-06)', () => {
  it('equal: per head, remainder and who absorbs it', () => {
    expect(
      splitSummary({
        amountPaise: 10000,
        splitMethod: 'equal',
        payerMembershipId: 9,
        participants: [P(3), P(1), P(2)],
      }),
    ).toEqual({ perHeadPaise: 3333, remainderPaise: 1, absorberMembershipId: 3 });
  });

  it('exact: remaining (negative = over)', () => {
    expect(
      splitSummary({
        amountPaise: 120000,
        splitMethod: 'exact',
        participants: [P(1, { valuePaise: 50000 }), P(2, { valuePaise: 60000 })],
      }),
    ).toEqual({ remainingPaise: 10000 });
    expect(
      splitSummary({
        amountPaise: 100000,
        splitMethod: 'exact',
        participants: [P(1, { valuePaise: 150000 })],
      }),
    ).toEqual({ remainingPaise: -50000 });
  });

  it('percentage: remaining basis points, missing values count as 0', () => {
    expect(
      splitSummary({
        amountPaise: 100000,
        splitMethod: 'percentage',
        participants: [P(1, { valueBp: 5000 }), P(2)],
      }),
    ).toEqual({ remainingBp: 5000 });
  });
});
