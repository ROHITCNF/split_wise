// Shared by db:reset and db:demo: snapshot the current database before deleting it,
// so a reset can always be undone from data/backups.
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { backupDatabase } from '../src/db/backup.js';

/** Backs up `dbPath` (if it exists) to data/backups, then removes it and its WAL files. */
export async function backupThenRemove(dbPath) {
  if (fs.existsSync(dbPath)) {
    const sqlite = new Database(dbPath, { readonly: true });
    const target = await backupDatabase(sqlite, {
      dir: path.join(path.dirname(dbPath), 'backups'),
    });
    sqlite.close();
    console.log(`Previous database saved to ${target}`);
  }
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${dbPath}${suffix}`, { force: true });
}
