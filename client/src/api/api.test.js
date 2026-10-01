import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch, apiUrl, setUnauthorizedHandler } from './client.js';
import { withConfirmation } from './confirm.js';
import { errorMessage } from './messages.js';
import { groupsApi, reportsApi } from './endpoints.js';

const json = (status, body) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
  });

let fetchMock;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  setUnauthorizedHandler(() => {});
});

describe('apiFetch', () => {
  it('sends JSON with same-origin credentials and returns the body', async () => {
    fetchMock.mockResolvedValue(json(200, { ok: true }));
    await expect(apiFetch('/groups', { method: 'POST', body: { name: 'Trip' } })).resolves.toEqual({
      ok: true,
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/groups');
    expect(init).toMatchObject({
      method: 'POST',
      credentials: 'same-origin',
      body: '{"name":"Trip"}',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    });
  });

  it('builds query strings, skipping empty values', async () => {
    fetchMock.mockResolvedValue(json(200, {}));
    await apiFetch('/reports', {
      query: { period: 'week', date: undefined, groupId: '', page: 2 },
    });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/reports?period=week&page=2');
  });

  it('returns null for 204', async () => {
    fetchMock.mockResolvedValue(json(204));
    await expect(apiFetch('/auth/logout', { method: 'POST', body: {} })).resolves.toBeNull();
  });

  it('maps API errors to ApiError with code, details and fieldErrors', async () => {
    fetchMock.mockResolvedValue(
      json(409, {
        error: {
          code: 'BALANCE_NOT_ZERO',
          message: 'You owe ₹350.00',
          details: { netPaise: -35000 },
        },
      }),
    );
    const err = await apiFetch('/groups/1/leave').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      code: 'BALANCE_NOT_ZERO',
      status: 409,
      message: 'You owe ₹350.00',
      details: { netPaise: -35000 },
    });
  });

  it('non-JSON error bodies become INTERNAL', async () => {
    fetchMock.mockResolvedValue(new Response('Bad gateway', { status: 502 }));
    await expect(apiFetch('/x')).rejects.toMatchObject({ code: 'INTERNAL', status: 502 });
  });

  it('network failure → NETWORK_ERROR', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(apiFetch('/x')).rejects.toMatchObject({ code: 'NETWORK_ERROR', status: 0 });
  });

  it('timeout → TIMEOUT', async () => {
    fetchMock.mockImplementation(
      (url, { signal }) =>
        new Promise((resolve, reject) =>
          signal.addEventListener('abort', () => reject(signal.reason)),
        ),
    );
    await expect(apiFetch('/x', { timeoutMs: 10 })).rejects.toMatchObject({ code: 'TIMEOUT' });
  });

  it('caller abort is re-thrown as-is (not wrapped)', async () => {
    fetchMock.mockImplementation(
      (url, { signal }) =>
        new Promise((resolve, reject) =>
          signal.addEventListener('abort', () => reject(new DOMException('x', 'AbortError'))),
        ),
    );
    const controller = new AbortController();
    const pending = apiFetch('/x', { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('401 calls the unauthorized handler unless the call opts out', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    fetchMock.mockResolvedValue(
      json(401, { error: { code: 'UNAUTHENTICATED', message: 'Please log in.' } }),
    );
    await apiFetch('/groups').catch(() => {});
    expect(handler).toHaveBeenCalledTimes(1);
    await apiFetch('/auth/login', { handleUnauthorized: false }).catch(() => {});
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('endpoints', () => {
  it('group delete passes confirm as a query flag (G5)', async () => {
    fetchMock.mockResolvedValue(json(204));
    await groupsApi.remove(3, { confirm: true });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/groups/3?confirm=true');
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
  });

  it('CSV and Google URLs are for navigation', () => {
    expect(reportsApi.csvUrl({ period: 'month', groupId: 2 })).toBe(
      '/api/reports/csv?period=month&groupId=2',
    );
    expect(apiUrl('/auth/google/start')).toBe('/api/auth/google/start');
  });
});

describe('withConfirmation (API §1.3)', () => {
  const confirmationError = new ApiError({
    code: 'CONFIRMATION_REQUIRED',
    status: 409,
    message: 'x',
    details: { reason: 'OVERPAYMENT' },
  });

  it('returns directly when no confirmation is needed', async () => {
    const send = vi.fn().mockResolvedValue('ok');
    await expect(withConfirmation(send, vi.fn())).resolves.toEqual({ done: true, result: 'ok' });
    expect(send).toHaveBeenCalledWith(false);
  });

  it('asks, then resends with confirm when the user agrees', async () => {
    const send = vi.fn().mockRejectedValueOnce(confirmationError).mockResolvedValueOnce('saved');
    const ask = vi.fn().mockResolvedValue(true);
    await expect(withConfirmation(send, ask)).resolves.toEqual({ done: true, result: 'saved' });
    expect(ask).toHaveBeenCalledWith(confirmationError);
    expect(send).toHaveBeenLastCalledWith(true);
  });

  it('stops when the user cancels', async () => {
    const send = vi.fn().mockRejectedValueOnce(confirmationError);
    await expect(withConfirmation(send, async () => false)).resolves.toEqual({ done: false });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('other errors propagate', async () => {
    const send = vi
      .fn()
      .mockRejectedValue(new ApiError({ code: 'FORBIDDEN', status: 403, message: 'no' }));
    await expect(withConfirmation(send, vi.fn())).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('errorMessage', () => {
  it('prefers the server message, falls back to the catalog, handles client codes', () => {
    expect(errorMessage({ code: 'BALANCE_NOT_ZERO', message: 'You owe ₹350.00' })).toBe(
      'You owe ₹350.00',
    );
    expect(errorMessage({ code: 'FORBIDDEN', message: '' })).toBe(
      "You don't have permission to do that.",
    );
    expect(errorMessage({ code: 'NETWORK_ERROR', message: 'x' })).toMatch(/Can't reach the server/);
  });
});
