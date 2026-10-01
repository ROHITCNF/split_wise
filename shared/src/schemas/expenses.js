import { z } from 'zod';
import { SPLIT_METHODS } from '../split.js';
import {
  confirm,
  dateString,
  id,
  optionalText,
  pagination,
  paise,
  pastOrTodayDate,
  text,
} from './common.js';

const participant = z.strictObject({
  membershipId: id,
  // 0 is allowed here and means "not participating" (FR-SPL-04); the split engine drops it.
  valuePaise: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
  valueBp: z.number().int().min(0).max(10000).optional(),
});

// E2 / E4 — sums are checked by the split engine so it can return
// SPLIT_SUM_MISMATCH / PERCENT_SUM_MISMATCH with the difference.
export const expenseBody = z
  .strictObject({
    description: text(1, 100),
    notes: optionalText(500),
    amountPaise: paise,
    expenseDate: pastOrTodayDate,
    payerMembershipId: id,
    splitMethod: z.enum(SPLIT_METHODS),
    participants: z.array(participant).min(1, 'Choose at least one person to split with'),
    confirm,
  })
  .superRefine((body, ctx) => {
    const ids = body.participants.map((p) => p.membershipId);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['participants'],
        message: 'Each person can appear only once',
      });
    }
    body.participants.forEach((p, index) => {
      const needs = { exact: 'valuePaise', percentage: 'valueBp' }[body.splitMethod];
      for (const field of ['valuePaise', 'valueBp']) {
        if (field === needs && p[field] === undefined) {
          ctx.addIssue({
            code: 'custom',
            path: ['participants', index, field],
            message: 'Required',
          });
        }
        if (field !== needs && p[field] !== undefined) {
          ctx.addIssue({
            code: 'custom',
            path: ['participants', index, field],
            message: `Not used for ${body.splitMethod} split`,
          });
        }
      }
    });
  });

// E1
export const expenseListQuery = z.strictObject({
  q: text(1, 100).optional(),
  date: dateString.optional(),
  amountPaise: z.coerce.number().pipe(paise).optional(),
  ...pagination,
});
