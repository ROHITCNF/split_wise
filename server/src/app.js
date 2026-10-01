import express from 'express';
import helmet from 'helmet';
import { config as defaultConfig } from './config.js';
import { requestLogger } from './middleware/requestLogger.js';
import { originCheck } from './middleware/originCheck.js';
import { loadSession } from './middleware/session.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { systemRoutes } from './modules/system/routes.js';

/**
 * Request pipeline shared by the real app and tests: security headers, logging,
 * JSON body, CSRF origin check, session loading.
 */
export function applyCoreMiddleware(app, ctx) {
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(requestLogger);
  app.use(express.json({ limit: '100kb' }));
  app.use(originCheck(ctx.config.appOrigin));
  app.use(loadSession(ctx));
}

/** Unknown /api routes and errors → API_CONTRACT §1.1 format. Must be mounted last. */
export function applyErrorHandling(app) {
  app.use('/api', notFound);
  app.use(errorHandler);
}

/**
 * Builds the Express app without starting a listener, so tests can drive it with
 * Supertest against an in-memory database.
 * @param {{ sqlite: import('better-sqlite3').Database, db: object }} database
 * @param {{ config?: typeof defaultConfig }} [options]
 */
export function createApp(database, { config = defaultConfig } = {}) {
  const ctx = { ...database, config };
  const app = express();

  applyCoreMiddleware(app, ctx);
  app.use('/api', systemRoutes(ctx));
  applyErrorHandling(app);

  return app;
}
