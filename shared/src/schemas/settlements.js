import { z } from 'zod';
import { confirm, id, optionalText, pagination, paise, pastOrTodayDate } from './common.js';

// S2 / S4 — "from ≠ to" is reported as SAME_PARTY by the server, not here.
export const settlementBody = z.strictObject({
  fromMembershipId: id,
  toMembershipId: id,
  amountPaise: paise,
  settlementDate: pastOrTodayDate,
  note: optionalText(200),
  confirm,
});

// S1
export const settlementListQuery = z.strictObject({ ...pagination });
