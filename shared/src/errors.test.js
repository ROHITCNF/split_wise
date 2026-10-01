import { describe, expect, it } from 'vitest';
import { AppError, ERRORS } from './errors.js';

describe('error catalog', () => {
  it('every code has a valid HTTP status and a message', () => {
    for (const [code, entry] of Object.entries(ERRORS)) {
      expect(entry.status, code).toBeGreaterThanOrEqual(400);
      expect(entry.message, code).toBeTruthy();
    }
  });
});

describe('AppError', () => {
  it('carries code, status, details and default message', () => {
    const error = new AppError('BALANCE_NOT_ZERO', { details: { netPaise: -35000 } });
    expect(error).toMatchObject({
      code: 'BALANCE_NOT_ZERO',
      status: 409,
      details: { netPaise: -35000 },
      message: ERRORS.BALANCE_NOT_ZERO.message,
    });
  });

  it('falls back to INTERNAL for unknown codes', () => {
    expect(new AppError('NOPE')).toMatchObject({ code: 'INTERNAL', status: 500 });
  });
});
