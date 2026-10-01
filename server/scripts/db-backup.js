// Snapshots the local SQLite database into data/backups, keeping the latest 30 (ADR-013).
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from '../src/config.js';
import { backupDatabase } from '../src/db/backup.js';

if (!fs.existsSync(config.dbPath)) {
  console.error(`No database at ${config.dbPath}. Run "npm run db:reset" first.`);
  process.exit(1);
}

const sqlite = new Database(config.dbPath, { readonly: true });
const target = await backupDatabase(sqlite, {
  dir: path.join(path.dirname(config.dbPath), 'backups'),
});
sqlite.close();

console.log(`Backup written to ${target}`);
