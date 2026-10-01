import { z } from 'zod';
import { confirm, id, optionalText, text } from './common.js';

export const groupName = text(1, 60);
export const groupDescription = optionalText(200);

// U1
export const userSearchQuery = z.strictObject({
  q: text(2, 60),
  groupId: id.optional(),
});

// G2
export const createGroupBody = z.strictObject({
  name: groupName,
  description: groupDescription,
  memberUserIds: z
    .array(id)
    .min(1, 'Add at least one member')
    .refine((ids) => new Set(ids).size === ids.length, 'Each person can be added only once'),
});

// G4 — at least one field.
export const updateGroupBody = z
  .strictObject({
    name: groupName.optional(),
    description: z.string().trim().max(200).nullable().optional(),
  })
  .refine((body) => body.name !== undefined || body.description !== undefined, {
    message: 'Nothing to update',
  })
  .transform((body) =>
    body.description === undefined ? body : { ...body, description: body.description || null },
  );

// G5 — ?confirm=true
export const deleteGroupQuery = z.strictObject({
  confirm: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

// M1
export const addMemberBody = z.strictObject({ userId: id });

// M3 — member sends {}, admin sends a mode.
export const leaveGroupBody = z.union([
  z.strictObject({ mode: z.literal('transfer'), newAdminMembershipId: id }),
  z.strictObject({ mode: z.literal('delete'), confirm }),
  z.strictObject({}),
]);
