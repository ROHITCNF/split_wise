import { ERRORS } from '@splitbook/shared';

const CLIENT_ERRORS = {
  NETWORK_ERROR: "Can't reach the server. Check your connection.",
  TIMEOUT: 'The server took too long to respond. Please try again.',
};

/**
 * User-facing text for an error (API_CONTRACT §12). Prefers the server's message
 * (it can be more specific, e.g. "You still owe ₹350.00"), then the catalog text.
 */
export function errorMessage(error) {
  if (!error) return '';
  if (CLIENT_ERRORS[error.code]) return CLIENT_ERRORS[error.code];
  return error.message || ERRORS[error.code]?.message || ERRORS.INTERNAL.message;
}
