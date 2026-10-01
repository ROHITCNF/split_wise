// Deletes the local SQLite database, re-creates the schema and loads seed data.
import fs from 'node:fs';
import { config } from '../src/config.js';
import { openDatabase } from '../src/db/connection.js';
import { seed, SEED_PASSWORD } from '../src/db/seed.js';

if (config.isProduction) {
  console.error('Refusing to reset the database when NODE_ENV=production.');
  process.exit(1);
}

for (const suffix of ['', '-wal', '-shm']) {
  fs.rmSync(`${config.dbPath}${suffix}`, { force: true });
}

const { sqlite } = openDatabase(config.dbPath);
await seed(sqlite);
sqlite.close();

console.log(`Database reset at ${config.dbPath}`);
console.log(`Seed logins: karan@, priya@, ravi@, ananya@example.com — password "${SEED_PASSWORD}"`);
