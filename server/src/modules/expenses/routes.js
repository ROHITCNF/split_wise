import { Router } from 'express';
import { expenseBody, expenseListQuery } from '@splitbook/shared';
import { validate } from '../../middleware/validate.js';
import {
  createExpense,
  deleteExpense,
  getExpense,
  getExpenseHistory,
  listExpenses,
  updateExpense,
} from './service.js';

/** E1–E6 (API_CONTRACT §9), mounted at /api/groups/:groupId/expenses behind requireMember. */
export function expenseRoutes(ctx) {
  const router = Router({ mergeParams: true });
  const expenseId = (req) => Number(req.params.expenseId);

  router.get('/', validate({ query: expenseListQuery }), (req, res) => {
    res.json(listExpenses(ctx, req.group, req.membership, req.valid.query));
  });

  router.post('/', validate({ body: expenseBody }), (req, res) => {
    const id = createExpense(ctx, req.user, req.group, req.membership, req.valid.body);
    res.status(201).json(getExpense(ctx, req.group, req.membership, id));
  });

  router.get('/:expenseId', (req, res) => {
    res.json(getExpense(ctx, req.group, req.membership, expenseId(req)));
  });

  router.put('/:expenseId', validate({ body: expenseBody }), (req, res) => {
    updateExpense(ctx, req.user, req.group, req.membership, expenseId(req), req.valid.body);
    res.json(getExpense(ctx, req.group, req.membership, expenseId(req)));
  });

  router.delete('/:expenseId', (req, res) => {
    deleteExpense(ctx, req.user, req.group, req.membership, expenseId(req));
    res.status(204).end();
  });

  router.get('/:expenseId/history', (req, res) => {
    res.json({ items: getExpenseHistory(ctx, req.group, expenseId(req)) });
  });

  return router;
}
