/** Current instant as an ISO-8601 UTC string, the format stored in every *_at column. */
export function nowIso() {
  return new Date().toISOString();
}
