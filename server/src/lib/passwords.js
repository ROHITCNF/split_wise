import argon2 from 'argon2';

const OPTIONS = { type: argon2.argon2id };
let dummyHash;

/** Argon2id hash (ADR-005). */
export function hashPassword(password) {
  return argon2.hash(password, OPTIONS);
}

/**
 * Verifies a password. With no hash (unknown email / Google-only account) it still
 * runs a verification against a dummy hash so response time doesn't reveal whether
 * an account exists.
 */
export async function verifyPassword(hash, password) {
  if (!hash) {
    dummyHash ??= await argon2.hash('dummy-password-for-timing', OPTIONS);
    await argon2.verify(dummyHash, password);
    return false;
  }
  return argon2.verify(hash, password);
}
