import express from 'express';
import helmet from 'helmet';
import { config as defaultConfig } from './config.js';
import { requestLogger } from './middleware/requestLogger.js';
import { originCheck } from './middleware/originCheck.js';
import { loadSession } from './middleware/session.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { systemRoutes } from './modules/system/routes.js';
import { authRoutes, devRoutes } from './modules/auth/routes.js';
import { createConsoleMailer } from './modules/auth/mailer.js';
import { createMockGoogleProvider } from './modules/auth/mockGoogle.js';
import { profileRoutes, userRoutes } from './modules/users/routes.js';
import { groupRoutes } from './modules/groups/routes.js';
import { expenseRoutes } from './modules/expenses/routes.js';
import { balanceRoutes } from './modules/balances/routes.js';
import { dashboardRoutes } from './modules/dashboard/routes.js';
import { activityRoutes, settlementRoutes } from './modules/settlements/routes.js';
import { notificationRoutes } from './modules/notifications/routes.js';
import { requireAuth } from './middleware/session.js';
import { requireMember } from './middleware/membership.js';

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
 * Mock Google sign-in and the console mailer are local-only (ADR-006). Production
 * must inject real implementations; there are none yet, so it refuses to start.
 */
function externalServices(config, { mailer, identityProvider }) {
  if (config.isProduction && (!mailer || !identityProvider)) {
    throw new Error('Production needs a real mailer and identity provider; mocks are disabled.');
  }
  return {
    mailer: mailer ?? createConsoleMailer(),
    identityProvider: identityProvider ?? createMockGoogleProvider(),
  };
}

/**
 * Builds the Express app without starting a listener, so tests can drive it with
 * Supertest against an in-memory database.
 * @param {{ sqlite: import('better-sqlite3').Database, db: object }} database
 * @param {{ config?: typeof defaultConfig, mailer?: object, identityProvider?: object }} [options]
 */
export function createApp(database, { config = defaultConfig, ...services } = {}) {
  const ctx = { ...database, config, ...externalServices(config, services) };
  const app = express();

  applyCoreMiddleware(app, ctx);
  app.use('/api', systemRoutes(ctx));
  app.use('/api/auth', authRoutes(ctx));
  app.use('/api/me', profileRoutes(ctx));
  app.use('/api/users', userRoutes(ctx));
  app.use('/api/dashboard', dashboardRoutes(ctx));
  app.use('/api/notifications', notificationRoutes(ctx));

  // Group-scoped resources: caller must be an active member (404 otherwise).
  const member = [requireAuth, requireMember(ctx)];
  app.use('/api/groups/:groupId/expenses', member, expenseRoutes(ctx));
  app.use('/api/groups/:groupId/balances', member, balanceRoutes(ctx));
  app.use('/api/groups/:groupId/settlements', member, settlementRoutes(ctx));
  app.use('/api/groups/:groupId/activity', member, activityRoutes(ctx));
  app.use('/api/groups', groupRoutes(ctx));
  if (!config.isProduction) app.use('/api/dev', devRoutes(ctx));
  applyErrorHandling(app);

  app.locals.ctx = ctx;
  return app;
}
