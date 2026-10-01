import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nowIso } from '../lib/time.js';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

/**
 * Applies every `NNNN_name.sql` file in ./migrations that has not run yet, in order,
 * each inside its own transaction. Hand-written SQL lets us use STRICT tables and
 * partial unique indexes, which Drizzle Kit cannot generate (plan M2).
 * @param {import('better-sqlite3').Database} sqlite
 * @returns {string[]} ids of migrations applied by this call
 */
export function migrate(sqlite) {
  sqlite.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id         TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  ) STRICT`);

  const applied = new Set(
    sqlite
      .prepare('SELECT id FROM schema_migrations')
      .all()
      .map((row) => row.id),
  );
  const pending = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
    .sort()
    .map((file) => file.replace(/\.sql$/, ''))
    .filter((id) => !applied.has(id));

  const record = sqlite.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)');
  for (const id of pending) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, `${id}.sql`), 'utf8');
    sqlite.transaction(() => {
      sqlite.exec(sql);
      record.run(id, nowIso());
    })();
  }
  return pending;
}
