// Client test helpers: a fake API keyed by "METHOD /path", and app rendering at a URL.
import { vi } from 'vitest';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { routes } from '@/routes/router.jsx';

export const USER = {
  id: 1,
  name: 'Karan Mehta',
  email: 'karan@example.com',
  emailVerified: true,
  loginMethods: ['password'],
};

export const json = (status, body) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
  });

export const apiError = (status, code, message = code, extra = {}) =>
  json(status, { error: { code, message, ...extra } });

/**
 * Installs a fake `fetch`. Handlers get `(init, url)` and return a Response.
 * Unknown routes answer 404. Returns the mock so tests can inspect calls.
 */
export function fakeServer(handlers) {
  const fetchMock = vi.fn(async (url, init = {}) => {
    const key = `${init.method ?? 'GET'} ${url.split('?')[0]}`;
    const handler = handlers[key];
    if (!handler) return apiError(404, 'NOT_FOUND', `No fake for ${key}`);
    return handler(init, url);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Common handlers for a logged-in user with no notifications. */
export const loggedIn = (user = USER) => ({
  'GET /api/auth/me': () => json(200, { user }),
  'GET /api/notifications/unread-count': () => json(200, { count: 0 }),
});

/** Bodies sent to an endpoint, parsed. */
export function sentBodies(fetchMock, method, path) {
  return fetchMock.mock.calls
    .filter(([url, init = {}]) => (init.method ?? 'GET') === method && url.split('?')[0] === path)
    .map(([, init]) => JSON.parse(init.body ?? 'null'));
}

export function renderAt(path) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

/** Group detail (G3) fixture. */
export function groupFixture(overrides = {}) {
  return {
    groupId: 3,
    name: 'Trip Goa',
    description: 'Dec 2026',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    me: { membershipId: 1, role: 'admin', netPaise: -35000 },
    members: [
      {
        membershipId: 1,
        userId: 1,
        name: 'Karan Mehta',
        email: 'karan@example.com',
        role: 'admin',
        status: 'active',
        joinedAt: '2026-09-01T00:00:00.000Z',
        endedAt: null,
        netPaise: -35000,
      },
      {
        membershipId: 2,
        userId: 2,
        name: 'Priya Sharma',
        email: 'priya@example.com',
        role: 'member',
        status: 'active',
        joinedAt: '2026-09-01T00:00:00.000Z',
        endedAt: null,
        netPaise: 35000,
      },
      {
        membershipId: 3,
        userId: 3,
        name: 'Ravi Kumar',
        email: 'ravi@example.com',
        role: 'member',
        status: 'active',
        joinedAt: '2026-09-02T00:00:00.000Z',
        endedAt: null,
        netPaise: 0,
      },
    ],
    pastMembers: [],
    ...overrides,
  };
}
