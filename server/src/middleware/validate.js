import { AppError, toFieldErrors } from '@splitbook/shared';

/**
 * Validates `req.body` / `req.query` with a shared Zod schema (ADR-010).
 * Parsed values land on `req.valid.body` / `req.valid.query` (Express 5 makes
 * `req.query` read-only). Failures become 400 VALIDATION_ERROR (or FUTURE_DATE).
 * @param {{ body?: import('zod').ZodType, query?: import('zod').ZodType }} schemas
 */
export function validate(schemas) {
  return (req, res, next) => {
    req.valid ??= {};
    for (const [source, schema] of Object.entries(schemas)) {
      const result = schema.safeParse(req[source] ?? {});
      if (!result.success) {
        const { code, fieldErrors } = toFieldErrors(result.error);
        return next(new AppError(code, { fieldErrors }));
      }
      req.valid[source] = result.data;
    }
    next();
  };
}
