import { config } from './config.js';
import { openDatabase } from './db/connection.js';
import { createApp } from './app.js';

// Opening the database applies any pending migrations before the API accepts requests.
const database = openDatabase(config.dbPath);

createApp(database).listen(config.port, () => {
  console.log(`SplitBook API listening on http://localhost:${config.port} (db: ${config.dbPath})`);
});
