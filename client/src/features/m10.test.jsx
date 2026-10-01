import { afterEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  apiError,
  fakeServer,
  groupFixture,
  json,
  loggedIn,
  renderAt,
  sentBodies,
  USER,
} from '@/test/utils.jsx';

afterEach(() => vi.unstubAllGlobals());

const anonymous = { 'GET /api/auth/me': () => apiError(401, 'UNAUTHENTICATED') };

describe('§2 auth screens', () => {
  it('sign up → check your email', async () => {
    const api = fakeServer({
      ...anonymous,
      'POST /api/auth/signup': () => json(202, { message: 'ok' }),
    });
    renderAt('/signup');
    await userEvent.type(await screen.findByLabelText('Name'), 'Karan');
    await userEvent.type(screen.getByLabelText('Email'), 'karan@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'secret-pass');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
    expect(sentBodies(api, 'POST', '/api/auth/signup')).toEqual([
      { name: 'Karan', email: 'karan@example.com', password: 'secret-pass' },
    ]);
  });

  it('sign up validates with the shared schema before calling the server', async () => {
    const api = fakeServer(anonymous);
    renderAt('/signup');
    await userEvent.type(await screen.findByLabelText('Password'), 'short');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Use 8–128 characters')).toBeInTheDocument();
    expect(sentBodies(api, 'POST', '/api/auth/signup')).toEqual([]);
  });

  it('existing email shows a field error with "Log in instead"', async () => {
    fakeServer({
      ...anonymous,
      'POST /api/auth/signup': () => apiError(409, 'EMAIL_ALREADY_REGISTERED'),
    });
    renderAt('/signup');
    await userEvent.type(await screen.findByLabelText('Name'), 'Karan');
    await userEvent.type(screen.getByLabelText('Email'), 'karan@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'secret-pass');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('link', { name: 'Log in instead' })).toBeInTheDocument();
  });

  it('verify link logs in and goes to the dashboard', async () => {
    let verified = false;
    const api = fakeServer({
      'GET /api/auth/me': () =>
        verified ? json(200, { user: USER }) : apiError(401, 'UNAUTHENTICATED'),
      'POST /api/auth/verify-email': () => {
        verified = true;
        return json(200, { user: USER });
      },
      'GET /api/notifications/unread-count': () => json(200, { count: 0 }),
      'GET /api/dashboard': () =>
        json(200, {
          totals: { youOwePaise: 0, owedToYouPaise: 0, netPaise: 0 },
          groups: [],
          recentActivity: [],
        }),
    });
    const router = renderAt('/verify?token=abc');
    expect(await screen.findByText(/Email verified/)).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.pathname).toBe('/'), { timeout: 3000 });
    expect(sentBodies(api, 'POST', '/api/auth/verify-email')).toEqual([{ token: 'abc' }]);
  });

  it('bad verify link offers resend', async () => {
    fakeServer({
      ...anonymous,
      'POST /api/auth/verify-email': () => apiError(400, 'TOKEN_INVALID_OR_EXPIRED'),
    });
    renderAt('/verify?token=old');
    expect(await screen.findByText(/invalid or has expired/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resend verification' })).toBeDisabled();
  });

  it('unverified login offers to resend the link', async () => {
    const api = fakeServer({
      ...anonymous,
      'POST /api/auth/login': () => apiError(403, 'EMAIL_NOT_VERIFIED', 'Verify your email first.'),
      'POST /api/auth/resend-verification': () => json(202, {}),
    });
    renderAt('/login');
    await userEvent.type(await screen.findByLabelText('Email'), 'karan@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Resend verification' }));
    expect(sentBodies(api, 'POST', '/api/auth/resend-verification')).toEqual([
      { email: 'karan@example.com' },
    ]);
  });
});

describe('§3 profile', () => {
  it('delete account: type DELETE, blocked by balances lists the groups', async () => {
    fakeServer({
      ...loggedIn(),
      'DELETE /api/me': () =>
        apiError(409, 'BALANCE_NOT_ZERO', 'Settle all balances first.', {
          details: { groups: [{ groupId: 3, groupName: 'Trip Goa', netPaise: -35000 }] },
        }),
    });
    renderAt('/profile');
    await userEvent.click(await screen.findByRole('button', { name: 'Delete account' }));
    const dialog = await screen.findByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: 'Delete' });
    expect(confirm).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText(/to confirm/), 'DELETE');
    await userEvent.click(confirm);
    expect(await screen.findByText("You can't delete your account yet")).toBeInTheDocument();
    expect(screen.getByText('Trip Goa')).toBeInTheDocument();
    expect(screen.getByText('₹350.00')).toBeInTheDocument();
  });

  it('Google-only account has no password form', async () => {
    fakeServer(loggedIn({ ...USER, loginMethods: ['google'] }));
    renderAt('/profile');
    expect(
      await screen.findByText('You sign in with Google. No password set.'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument();
  });
});

describe('§4 dashboard', () => {
  it('shows totals, groups with balance and recent activity', async () => {
    fakeServer({
      ...loggedIn(),
      'GET /api/dashboard': () =>
        json(200, {
          totals: { youOwePaise: 35000, owedToYouPaise: 120000, netPaise: 85000 },
          groups: [{ groupId: 3, name: 'Trip Goa', netPaise: -35000, memberCount: 3 }],
          recentActivity: [
            {
              id: 1,
              groupId: 3,
              groupName: 'Trip Goa',
              type: 'expense_created',
              summary: "Priya added 'Dinner' ₹1,200.00",
              createdAt: '2026-09-30T16:15:00.000Z',
            },
          ],
        }),
    });
    renderAt('/');
    expect(await screen.findByText('₹1,200.00')).toBeInTheDocument();
    expect(screen.getByText('+')).toBeInTheDocument();
    expect(screen.getByText('you owe')).toBeInTheDocument();
    expect(screen.getByText('Trip Goa · 30 Sep 2026, 21:45')).toBeInTheDocument();
  });

  it('empty state when no groups', async () => {
    fakeServer({
      ...loggedIn(),
      'GET /api/dashboard': () =>
        json(200, {
          totals: { youOwePaise: 0, owedToYouPaise: 0, netPaise: 0 },
          groups: [],
          recentActivity: [],
        }),
    });
    renderAt('/');
    expect(
      await screen.findByRole('link', { name: 'Create your first group' }),
    ).toBeInTheDocument();
  });
});

describe('§5 create group', () => {
  it('search, pick members, create → group page', async () => {
    const api = fakeServer({
      ...loggedIn(),
      'GET /api/users/search': () =>
        json(200, { items: [{ userId: 2, name: 'Priya Sharma', email: 'priya@example.com' }] }),
      'POST /api/groups': () => json(201, groupFixture({ groupId: 9 })),
      'GET /api/groups/9': () => json(200, groupFixture({ groupId: 9 })),
    });
    const router = renderAt('/groups/new');
    const create = await screen.findByRole('button', { name: 'Create group' });
    await userEvent.type(screen.getByLabelText('Group name *'), 'Trip Goa');
    expect(create).toBeDisabled(); // needs a member (FR-GRP-02)
    await userEvent.type(screen.getByLabelText('Search people by name'), 'pri');
    await userEvent.click(await screen.findByRole('button', { name: /Add/ }));
    expect(screen.getByRole('button', { name: 'Remove Priya Sharma' })).toBeInTheDocument();
    await userEvent.click(create);
    await waitFor(() => expect(router.state.location.pathname).toBe('/groups/9/expenses'));
    expect(sentBodies(api, 'POST', '/api/groups')).toEqual([
      { name: 'Trip Goa', description: null, memberUserIds: [2] },
    ]);
  });
});

describe('§6–§7 group, members, leave, delete', () => {
  const groupHandlers = (group = groupFixture()) => ({
    ...loggedIn(),
    'GET /api/groups/3': () => json(200, group),
    'GET /api/groups/3/balances': () =>
      json(200, {
        pairs: [
          {
            from: { membershipId: 1, name: 'Karan Mehta' },
            to: { membershipId: 2, name: 'Priya Sharma' },
            amountPaise: 35000,
          },
        ],
        me: { netPaise: -35000, youOwe: [], owesYou: [] },
      }),
  });

  it('unknown group → "This group isn\'t available"', async () => {
    fakeServer(loggedIn());
    renderAt('/groups/99/members');
    expect(await screen.findByText("This group isn't available.")).toBeInTheDocument();
  });

  it('members tab shows roles and balances; admin can remove others', async () => {
    const api = fakeServer({
      ...groupHandlers(),
      'DELETE /api/groups/3/members/3': () => json(204),
    });
    renderAt('/groups/3/members');
    expect(await screen.findByRole('heading', { name: 'Members (3)' })).toBeInTheDocument();
    expect(screen.getByText('owed')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Actions for Karan Mehta' }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Ravi Kumar' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Remove from group' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        '/api/groups/3/members/3',
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
  });

  it('admin leave → transfer blocked while balance is not zero', async () => {
    fakeServer(groupHandlers());
    renderAt('/groups/3/settings');
    await userEvent.click(await screen.findByRole('button', { name: 'Leave group' }));
    expect(await screen.findByText("You're the admin of Trip Goa")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  it('admin leave → delete path requires typing the group name', async () => {
    const api = fakeServer({
      ...groupHandlers(),
      'POST /api/groups/3/leave': () => json(204),
      'GET /api/groups': () => json(200, { items: [] }),
    });
    const router = renderAt('/groups/3/settings');
    await userEvent.click(await screen.findByRole('button', { name: 'Leave group' }));
    await userEvent.click(await screen.findByLabelText('Leave and delete the group'));
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText(/These balances are still open/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/to confirm/), 'Trip Goa');
    await userEvent.click(screen.getByRole('button', { name: 'Delete group' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/groups'));
    expect(sentBodies(api, 'POST', '/api/groups/3/leave')).toEqual([
      { mode: 'delete', confirm: true },
    ]);
  });

  it('member leaving with a balance is told to settle up', async () => {
    const group = groupFixture({ me: { membershipId: 2, role: 'member', netPaise: 35000 } });
    fakeServer({
      ...groupHandlers(group),
      'POST /api/groups/3/leave': () =>
        apiError(409, 'BALANCE_NOT_ZERO', 'Settle up before leaving this group.', {
          details: { netPaise: 35000 },
        }),
    });
    renderAt('/groups/3/settings');
    await userEvent.click(await screen.findByRole('button', { name: 'Leave group' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Leave' }));
    expect(await screen.findByText("You can't leave yet")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete group' })).not.toBeInTheDocument(); // members have no danger zone
  });
});
