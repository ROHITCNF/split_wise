import { z } from 'zod';
import { email, password, personName } from './common.js';

// A1
export const signupBody = z.strictObject({ name: personName, email, password });

// A2
export const verifyEmailBody = z.strictObject({ token: z.string().min(1).max(256) });

// A3
export const resendVerificationBody = z.strictObject({ email });

// A4 — password length is not re-checked at login so old passwords still work.
export const loginBody = z.strictObject({ email, password: z.string().min(1).max(128) });

// P1
export const updateProfileBody = z.strictObject({ name: personName });

// P2
export const changePasswordBody = z.strictObject({
  currentPassword: z.string().min(1).max(128),
  newPassword: password,
});
