// Re-creates the local database with the base seed plus rich presentation data.
// Same as `db:reset` + extra users, groups, months of expenses and payments.
import { config } from '../src/config.js';
import { backupThenRemove } from './safe-reset.js';
import { openDatabase } from '../src/db/connection.js';
import { seed, SEED_PASSWORD } from '../src/db/seed.js';
import { seedDemo } from '../src/db/demoSeed.js';

if (config.isProduction) {
  console.error('Refusing to load demo data when NODE_ENV=production.');
  process.exit(1);
}

console.warn('Stop `npm run dev` first if it is running — it keeps using the old database file.');
await backupThenRemove(config.dbPath);

const database = openDatabase(config.dbPath);
await seed(database.sqlite);
const summary = await seedDemo(database);
database.sqlite.close();

console.log(
  `Demo database ready at ${config.dbPath} (${summary.users} users, ${summary.groups} extra groups).`,
);
console.log(
  `Log in as any of: karan, priya, ravi, ananya, arjun, sneha, vikram, meera, rohan, isha` +
    ` @example.com — password "${SEED_PASSWORD}". Best demo account: karan@example.com`,
);
