import crypto from 'node:crypto';

/** Unguessable URL-safe token for session cookies and email links. */
export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** Tokens are stored only as SHA-256 hashes (DATABASE_SCHEMA §4.3–4.4). */
export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
