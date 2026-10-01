let clock = () => new Date();

/** Current instant as an ISO-8601 UTC string, the format stored in every *_at column. */
export function nowIso() {
  return clock().toISOString();
}

/**
 * Runs `fn` with `nowIso()` frozen at `instant`. Only for generating demo data with
 * realistic past timestamps (db/demoSeed.js); the app itself never calls this.
 * `fn` must be synchronous.
 * @template T
 * @param {Date} instant
 * @param {() => T} fn
 * @returns {T}
 */
export function atTime(instant, fn) {
  const previous = clock;
  clock = () => instant;
  try {
    return fn();
  } finally {
    clock = previous;
  }
}
