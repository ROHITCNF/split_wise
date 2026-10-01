import { AppError } from '@splitbook/shared';

/** Unknown /api route → 404 NOT_FOUND in the standard error format. */
export function notFound(req, res, next) {
  next(new AppError('NOT_FOUND'));
}

/**
 * Central error handler producing API_CONTRACT §1.1:
 * `{ error: { code, message, fieldErrors?, details? } }`.
 * Unexpected errors become 500 INTERNAL with a generic message; the real error is
 * logged with the request ID, never sent to the client.
 */
// eslint-disable-next-line no-unused-vars -- Express needs the 4-argument signature
export function errorHandler(err, req, res, next) {
  let error = err;
  if (err?.type === 'entity.parse.failed') {
    error = new AppError('VALIDATION_ERROR', { message: 'Request body is not valid JSON.' });
  } else if (err?.type === 'entity.too.large') {
    error = new AppError('VALIDATION_ERROR', { message: 'Request body is too large.' });
  } else if (!(err instanceof AppError)) {
    req.log?.error({ err }, 'unhandled error');
    error = new AppError('INTERNAL');
  }

  const body = { code: error.code, message: error.message };
  if (error.fieldErrors) body.fieldErrors = error.fieldErrors;
  if (error.details) body.details = error.details;
  res.status(error.status).json({ error: body });
}
