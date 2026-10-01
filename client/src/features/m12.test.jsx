import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { todayIST, weekRange } from '@splitbook/shared';
import { fakeServer, groupFixture, json, renderAt, USER } from '@/test/utils.jsx';
import { notificationPath, timeAgo } from './notifications/notificationLinks.js';
import { shiftDate } from './reports/ReportsPage.jsx';

afterEach(() => vi.unstubAllGlobals());

const notification = (id, overrides = {}) => ({
  notificationId: id,
  type: 'expense_created',
  message: `Message ${id}`,
  groupId: 3,
  groupName: 'Trip Goa',
  link: { type: 'expense', groupId: 3, id: 41 },
  read: false,
  createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  ...overrides,
});

describe('§12.1 bell popover', () => {
  it('shows the latest 5; clicking one marks it read and opens the expense', async () => {
    let unread = 2;
    const api = fakeServer({
      'GET /api/auth/me': () => json(200, { user: USER }),
      'GET /api/notifications/unread-count': () => json(200, { count: unread }),
      'GET /api/notifications': () =>
        json(200, {
          items: [notification(2), notification(1, { read: true })],
          page: 1,
          pageSize: 5,
          total: 2,
        }),
      'POST /api/notifications/2/read': () => {
        unread = 1;
        return json(204);
      },
      'GET /api/dashboard': () =>
        json(200, {
          totals: { youOwePaise: 0, owedToYouPaise: 0, netPaise: 0 },
          groups: [],
          recentActivity: [],
        }),
      'GET /api/groups/3': () => json(200, groupFixture()),
      'GET /api/groups/3/expenses/41': () =>
        json(404, { error: { code: 'NOT_FOUND', message: 'x' } }),
      'GET /api/groups/3/expenses/41/history': () => json(200, { items: [] }),
    });
    const router = renderAt('/');
    await userEvent.click(await screen.findByRole('button', { name: 'Notifications, 2 unread' }));
    const popover = await screen.findByRole('dialog');
    expect(await within(popover).findByText('Message 2')).toBeInTheDocument();
    expect(within(popover).getAllByText(/5 min ago/)).toHaveLength(2);
    expect(api.mock.calls.some(([url]) => url === '/api/notifications?pageSize=5')).toBe(true);

    await userEvent.click(within(popover).getByText('Message 2'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/groups/3/expenses/41'));
    expect(api).toHaveBeenCalledWith(
      '/api/notifications/2/read',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

describe('§12.2 notifications page', () => {
  it('unread filter, mark all as read, deleted-group rows are not clickable', async () => {
    const api = fakeServer({
      'GET /api/auth/me': () => json(200, { user: USER }),
      'GET /api/notifications/unread-count': () => json(200, { count: 1 }),
      'GET /api/notifications': (_init, url) =>
        json(200, {
          items: url.includes('unreadOnly=true')
            ? [notification(3)]
            : [
                notification(3),
                notification(4, {
                  link: null,
                  groupId: null,
                  message: 'Trip 2025 was deleted',
                  read: true,
                }),
              ],
          page: 1,
          pageSize: 20,
          total: url.includes('unreadOnly=true') ? 1 : 2,
        }),
      'POST /api/notifications/read-all': () => json(204),
    });
    renderAt('/notifications');
    expect(await screen.findByText('Group deleted')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Trip 2025 was deleted/ })).toBeDisabled();

    await userEvent.click(screen.getByRole('tab', { name: 'Unread' }));
    await waitFor(() =>
      expect(screen.queryByText('Trip 2025 was deleted')).not.toBeInTheDocument(),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Mark all as read' }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        '/api/notifications/read-all',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
  });

  it('empty state', async () => {
    fakeServer({
      'GET /api/auth/me': () => json(200, { user: USER }),
      'GET /api/notifications/unread-count': () => json(200, { count: 0 }),
      'GET /api/notifications': () => json(200, { items: [], page: 1, pageSize: 20, total: 0 }),
    });
    renderAt('/notifications');
    expect(await screen.findByText("You're all caught up.")).toBeInTheDocument();
  });
});

describe('§13 reports', () => {
  const report = (period, from, to, label) => ({
    period: { type: period, from, to, label },
    groupId: null,
    totals: {
      paidPaise: 150000,
      mySharePaise: 95000,
      settlementsPaidPaise: 35000,
      settlementsReceivedPaise: 0,
    },
    expenses: [
      {
        expenseId: 1,
        date: from,
        groupId: 3,
        groupName: 'Trip Goa',
        description: 'Dinner',
        payer: { membershipId: 2, name: 'Priya Sharma', status: 'active' },
        amountPaise: 120000,
        mySharePaise: 30000,
        splitMethod: 'equal',
      },
    ],
    settlements: [],
  });

  it('defaults to this week; previous period; next disabled for the current period; group filter and CSV link', async () => {
    const thisWeek = weekRange(todayIST());
    const api = fakeServer({
      'GET /api/auth/me': () => json(200, { user: USER }),
      'GET /api/notifications/unread-count': () => json(200, { count: 0 }),
      'GET /api/groups': () => json(200, { items: [{ groupId: 3, name: 'Trip Goa' }] }),
      'GET /api/reports': (_init, url) => {
        const date = new URL(url, 'http://x').searchParams.get('date');
        const { from, to } = weekRange(date);
        return json(200, report('week', from, to, `${from} label`));
      },
    });
    renderAt('/reports');
    expect(await screen.findByText(`${thisWeek.from} label`)).toBeInTheDocument();
    expect(screen.getByText('₹950.00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next period' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Previous period' }));
    const prev = shiftDate(thisWeek.from, { days: -7 });
    expect(await screen.findByText(`${prev} label`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next period' })).toBeEnabled();

    expect(screen.getByRole('link', { name: 'CSV' })).toHaveAttribute(
      'href',
      `/api/reports/csv?period=week&date=${prev}`,
    );

    await userEvent.click(screen.getByRole('combobox', { name: 'Group' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Trip Goa' }));
    await waitFor(() =>
      expect(
        api.mock.calls.some(([url]) => url === `/api/reports?period=week&date=${prev}&groupId=3`),
      ).toBe(true),
    );
  });

  it('empty period', async () => {
    fakeServer({
      'GET /api/auth/me': () => json(200, { user: USER }),
      'GET /api/notifications/unread-count': () => json(200, { count: 0 }),
      'GET /api/groups': () => json(200, { items: [] }),
      'GET /api/reports': () =>
        json(200, { ...report('week', '2026-09-28', '2026-10-04', 'x'), expenses: [] }),
    });
    renderAt('/reports');
    expect(await screen.findByText('No expenses or payments in this period.')).toBeInTheDocument();
  });
});

describe('helpers', () => {
  it('shiftDate moves weeks and months', () => {
    expect(shiftDate('2026-09-28', { days: -7 })).toBe('2026-09-21');
    expect(shiftDate('2026-12-28', { days: 7 })).toBe('2027-01-04');
    expect(shiftDate('2026-10-01', { months: -1 })).toBe('2026-09-01');
    expect(shiftDate('2026-01-01', { months: -1 })).toBe('2025-12-01');
  });

  it('notificationPath and timeAgo', () => {
    expect(notificationPath(null)).toBeNull();
    expect(notificationPath({ type: 'settlement', groupId: 3, id: 5 })).toBe(
      '/groups/3/settlements',
    );
    expect(notificationPath({ type: 'group', groupId: 3, id: 3 })).toBe('/groups/3/expenses');
    const now = Date.parse('2026-10-01T12:00:00Z');
    expect(timeAgo('2026-10-01T11:59:40Z', now)).toBe('just now');
    expect(timeAgo('2026-10-01T10:00:00Z', now)).toBe('2 h ago');
    expect(timeAgo('2026-09-30T12:00:00Z', now)).toBe('1 day ago');
  });
});
