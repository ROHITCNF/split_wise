import fs from 'node:fs';
import path from 'node:path';

const BACKUP_PATTERN = /^app-\d{8}T\d{6}Z\.db$/;

/**
 * Writes a consistent snapshot using SQLite's online backup API (safe while the app runs)
 * and keeps only the newest `keep` snapshots (ADR-013).
 * @param {import('better-sqlite3').Database} sqlite
 * @param {{ dir: string, keep?: number, now?: Date }} options
 * @returns {Promise<string>} path of the new backup
 */
export async function backupDatabase(sqlite, { dir, keep = 30, now = new Date() }) {
  fs.mkdirSync(dir, { recursive: true });
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, 'Z');
  const target = path.join(dir, `app-${stamp}.db`);
  await sqlite.backup(target);

  const backups = fs
    .readdirSync(dir)
    .filter((file) => BACKUP_PATTERN.test(file))
    .sort();
  for (const old of backups.slice(0, Math.max(0, backups.length - keep))) {
    fs.rmSync(path.join(dir, old));
  }
  return target;
}
