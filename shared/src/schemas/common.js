import { z } from 'zod';
import { isFutureDate, isValidDateString } from '../dates.js';

export const id = z.coerce.number().int().positive();

/** Positive integer paise within the safe range (ADR-003). */
export const paise = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

/** Required text, trimmed, with a character limit. */
export const text = (min, max) => z.string().trim().min(min).max(max);

/** Optional text: missing, null or blank all become null. */
export const optionalText = (max) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value ? value : null));

export const dateString = z.string().refine(isValidDateString, 'Use a valid date (YYYY-MM-DD)');

/** Calendar date that is today or earlier in IST (FR-EXP-04). */
export const pastOrTodayDate = dateString.refine((value) => !isFutureDate(value), {
  message: 'Date cannot be in the future',
  params: { code: 'FUTURE_DATE' },
});

export const email = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const password = z.string().min(8).max(128);

export const personName = text(1, 60);

export const confirm = z.boolean().optional().default(false);

/** `page` / `pageSize` query params (API_CONTRACT §1). */
export const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};

/** Query-string boolean: "true" / "false". */
export const queryBoolean = z
  .enum(['true', 'false'])
  .optional()
  .transform((value) => value === 'true');
