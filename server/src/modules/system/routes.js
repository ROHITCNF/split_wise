import { Router } from 'express';

/** H1 — liveness plus a database read (API_CONTRACT §11). */
export function systemRoutes(ctx) {
  const router = Router();

  router.get('/health', (req, res) => {
    try {
      ctx.sqlite.prepare('SELECT 1').get();
      res.json({ status: 'ok', db: 'ok' });
    } catch (err) {
      req.log?.error({ err }, 'health check: database unreadable');
      res.status(503).json({ status: 'error', db: 'error' });
    }
  });

  return router;
}
