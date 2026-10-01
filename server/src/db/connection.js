import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import { migrate } from './migrate.js';

/**
 * Opens the SQLite database with the pragmas from DATABASE_SCHEMA §1 and applies
 * pending migrations. Pass ':memory:' for tests.
 * @param {string} file
 * @returns {{ sqlite: import('better-sqlite3').Database, db: ReturnType<typeof drizzle> }}
 */
export function openDatabase(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });

  const sqlite = new Database(file);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('synchronous = NORMAL');

  migrate(sqlite);

  return { sqlite, db: drizzle(sqlite, { schema }) };
}
