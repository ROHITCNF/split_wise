/**
 * Runs `fn` inside one SQLite transaction (ADR-007): every write in a command —
 * the change itself, change record, activity event, notifications — commits or
 * rolls back together. Drizzle queries share the same connection, so they join it.
 * Nested calls become savepoints. `fn` must be synchronous (better-sqlite3).
 * @template T
 * @param {{ sqlite: import('better-sqlite3').Database }} ctx
 * @param {() => T} fn
 * @returns {T}
 */
export function withTransaction(ctx, fn) {
  return ctx.sqlite.transaction(fn)();
}
