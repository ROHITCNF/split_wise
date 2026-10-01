import { z } from 'zod';
import { dateString, id, pagination, queryBoolean } from './common.js';

// B2
export const balanceBreakdownQuery = z.strictObject({ a: id, b: id });

// AC1
export const activityListQuery = z.strictObject({ ...pagination });

// N1
export const notificationListQuery = z.strictObject({ unreadOnly: queryBoolean, ...pagination });

// R1 / R2 — `date` defaults to today (IST) on the server.
export const reportQuery = z.strictObject({
  period: z.enum(['week', 'month']),
  date: dateString.optional(),
  groupId: id.optional(),
});
