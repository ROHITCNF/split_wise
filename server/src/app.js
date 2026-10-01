import express from 'express';
import { APP_NAME } from '@splitbook/shared';

/**
 * Builds the Express app without starting a listener, so tests can drive it
 * with Supertest. Middleware, sessions and modules are added in M3+.
 */
export function createApp() {
  const app = express();

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', app: APP_NAME });
  });

  return app;
}
