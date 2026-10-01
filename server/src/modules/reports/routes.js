import { Router } from 'express';
import { reportQuery } from '@splitbook/shared';
import { requireAuth } from '../../middleware/session.js';
import { validate } from '../../middleware/validate.js';
import { buildReport } from './service.js';
import { reportToCsv } from './csv.js';

/** R1–R2 (API_CONTRACT §11), mounted at /api/reports. */
export function reportRoutes(ctx) {
  const router = Router();
  router.use(requireAuth);

  router.get('/', validate({ query: reportQuery }), (req, res) => {
    res.json(buildReport(ctx, req.user, req.valid.query));
  });

  router.get('/csv', validate({ query: reportQuery }), (req, res) => {
    const report = buildReport(ctx, req.user, req.valid.query);
    res
      .type('text/csv; charset=utf-8')
      .attachment(`report-${report.period.type}-${report.period.from}.csv`)
      .send(reportToCsv(report));
  });

  return router;
}
