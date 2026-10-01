// In-house network layer on top of fetch (ADR-014). Screens never call fetch
// directly; they use the endpoint functions in ./endpoints.js.

const BASE_URL = '/api';
const DEFAULT_TIMEOUT_MS = 15_000;

/** Error thrown for every failed call. `code` comes from the API error catalog. */
export class ApiError extends Error {
  /**
   * @param {{ code: string, message: string, status: number,
   *           details?: object, fieldErrors?: Record<string,string> }} init
   */
  constructor({ code, message, status, details, fieldErrors }) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
    this.fieldErrors = fieldErrors;
  }
}

let onUnauthorized = () => {};

/** Called on any 401 (session expired / logged out elsewhere). Set by the auth provider. */
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

function buildUrl(path, query) {
  const url = `${BASE_URL}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

/** URL for full-page navigation (CSV download, Google sign-in). */
export function apiUrl(path, query) {
  return buildUrl(path, query);
}

/**
 * Calls the API and returns the parsed JSON body (null for 204).
 * @param {string} path  e.g. '/groups/3'
 * @param {{ method?: string, body?: object, query?: object, signal?: AbortSignal,
 *           timeoutMs?: number, handleUnauthorized?: boolean }} [options]
 * @throws {ApiError}
 */
export async function apiFetch(
  path,
  {
    method = 'GET',
    body,
    query,
    signal,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    handleUnauthorized = true,
  } = {},
) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new DOMException('timeout', 'TimeoutError')),
    timeoutMs,
  );
  const onCallerAbort = () => controller.abort(signal.reason);
  signal?.addEventListener('abort', onCallerAbort, { once: true });

  let response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      credentials: 'same-origin',
      headers:
        body === undefined
          ? { Accept: 'application/json' }
          : { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (signal?.aborted) throw err; // caller cancelled (e.g. unmount) — let them ignore it
    const timedOut = controller.signal.reason?.name === 'TimeoutError';
    throw new ApiError({
      code: timedOut ? 'TIMEOUT' : 'NETWORK_ERROR',
      status: 0,
      message: timedOut
        ? 'The server took too long to respond.'
        : "Can't reach the server. Check your connection.",
    });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onCallerAbort);
  }

  if (response.status === 204) return null;

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await response.json().catch(() => null) : null;

  if (response.ok) return payload;

  const error = payload?.error;
  const apiError = new ApiError({
    code: error?.code ?? 'INTERNAL',
    status: response.status,
    message: error?.message ?? 'Something went wrong. Please try again.',
    details: error?.details,
    fieldErrors: error?.fieldErrors,
  });
  if (response.status === 401 && handleUnauthorized) onUnauthorized(apiError);
  throw apiError;
}

/** True when an error came from aborting a request (ignore it in UI code). */
export function isAbortError(err) {
  return err?.name === 'AbortError';
}
