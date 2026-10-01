import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { routes } from './router.jsx';
import { safeNext } from '@/auth/guards.jsx';

const USER = {
  id: 1,
  name: 'Karan Mehta',
  email: 'karan@example.com',
  emailVerified: true,
  loginMethods: ['password'],
};

const json = (status, body) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
  });

/** Minimal fake server keyed by "METHOD /path". */
function fakeServer(handlers) {
  return vi.fn(async (url, init = {}) => {
    const key = `${init.method ?? 'GET'} ${url.split('?')[0]}`;
    const handler = handlers[key];
    if (!handler) return json(404, { error: { code: 'NOT_FOUND', message: 'nope' } });
    return handler(init);
  });
}

function renderAt(path) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

const anonymous = () =>
  json(401, { error: { code: 'UNAUTHENTICATED', message: 'Please log in.' } });

afterEach(() => vi.unstubAllGlobals());

describe('auth guard', () => {
  it('anonymous user is sent to /login with next', async () => {
    vi.stubGlobal('fetch', fakeServer({ 'GET /api/auth/me': anonymous }));
    const router = renderAt('/groups/3/balances');
    await screen.findByRole('heading', { name: 'Log in' });
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toBe(`?next=${encodeURIComponent('/groups/3/balances')}`);
  });

  it('logging in returns to next', async () => {
    let loggedIn = false;
    vi.stubGlobal(
      'fetch',
      fakeServer({
        'GET /api/auth/me': () => (loggedIn ? json(200, { user: USER }) : anonymous()),
        'POST /api/auth/login': (init) => {
          expect(JSON.parse(init.body)).toEqual({
            email: 'karan@example.com',
            password: 'password123',
          });
          loggedIn = true;
          return json(200, { user: USER });
        },
        'GET /api/notifications/unread-count': () => json(200, { count: 0 }),
      }),
    );
    const router = renderAt('/login?next=%2Freports');
    await userEvent.type(await screen.findByLabelText('Email'), 'karan@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/reports'));
  });

  it('shows the server error on failed login', async () => {
    vi.stubGlobal(
      'fetch',
      fakeServer({
        'GET /api/auth/me': anonymous,
        'POST /api/auth/login': () =>
          json(401, {
            error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' },
          }),
      }),
    );
    renderAt('/login');
    await userEvent.click(await screen.findByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('Email or password is incorrect.')).toBeInTheDocument();
  });

  it('next must be a same-site path (no open redirect)', () => {
    expect(safeNext('/groups/1')).toBe('/groups/1');
    expect(safeNext('//evil.example')).toBe('/');
    expect(safeNext('https://evil.example')).toBe('/');
    expect(safeNext(null)).toBe('/');
  });
});

describe('app shell (WIREFRAMES §1)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      fakeServer({
        'GET /api/auth/me': () => json(200, { user: USER }),
        'GET /api/notifications/unread-count': () => json(200, { count: 12 }),
        'POST /api/auth/logout': () => json(204),
      }),
    );
  });

  it('shows nav, unread badge (9+) and the user menu', async () => {
    renderAt('/');
    expect(await screen.findByRole('link', { name: 'Dashboard' })).toHaveClass('border-primary');
    expect(screen.getByRole('link', { name: 'Groups' })).toBeInTheDocument();
    expect(await screen.findByText('9+')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Notifications, 12 unread' })).toBeInTheDocument();
    expect(screen.getByText('Karan')).toBeInTheDocument();
  });

  it('logs out from the profile menu', async () => {
    const router = renderAt('/');
    await userEvent.click(await screen.findByText('Karan'));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Log out' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(fetch).toHaveBeenCalledWith(
      '/api/auth/logout',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('/groups/:id redirects to the expenses tab', async () => {
    const router = renderAt('/groups/7');
    await waitFor(() => expect(router.state.location.pathname).toBe('/groups/7/expenses'));
  });

  it('a later 401 from any call drops back to /login', async () => {
    const router = renderAt('/');
    await screen.findByText('Karan');
    const { apiFetch } = await import('@/api/client.js');
    vi.stubGlobal('fetch', fakeServer({}));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => anonymous()),
    );
    await apiFetch('/groups').catch(() => {});
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  });
});
