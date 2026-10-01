export * from './auth.js';
export * from './groups.js';
export * from './expenses.js';
export * from './settlements.js';
export * from './misc.js';
export { pagination } from './common.js';

/**
 * Turns a failed Zod parse into `{ code, fieldErrors }` matching API_CONTRACT §1.1.
 * A FUTURE_DATE issue is promoted to its own error code.
 * @param {import('zod').ZodError} error
 */
export function toFieldErrors(error) {
  const fieldErrors = {};
  let code = 'VALIDATION_ERROR';
  for (const issue of error.issues) {
    const path = issue.path.join('.') || '_';
    fieldErrors[path] ??= issue.message;
    if (issue.params?.code === 'FUTURE_DATE') code = 'FUTURE_DATE';
  }
  return { code, fieldErrors };
}
