import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { todayIST } from '@splitbook/shared';
import {
  apiError,
  fakeServer,
  groupFixture,
  json,
  loggedIn,
  renderAt,
  sentBodies,
} from '@/test/utils.jsx';
import { diffLines } from './expenses/ExpenseDetailPage.jsx';

afterEach(() => vi.unstubAllGlobals());

const ref = (membershipId, name, status = 'active') => ({
  membershipId,
  userId: membershipId,
  name,
  status,
});
const KARAN = ref(1, 'Karan Mehta');
const PRIYA = ref(2, 'Priya Sharma');
const RAVI = ref(3, 'Ravi Kumar');

function expenseFixture(overrides = {}) {
  return {
    expenseId: 41,
    groupId: 3,
    description: 'Dinner at Thalassa',
    notes: 'Includes tip',
    amountPaise: 120000,
    expenseDate: '2026-09-30',
    splitMethod: 'percentage',
    payer: PRIYA,
    createdBy: PRIYA,
    shares: [
      { member: KARAN, sharePaise: 60000, inputPaise: null, inputBp: 5000, position: 0 },
      { member: PRIYA, sharePaise: 30000, inputPaise: null, inputBp: 2500, position: 1 },
      { member: RAVI, sharePaise: 30000, inputPaise: null, inputBp: 2500, position: 2 },
    ],
    myShare: { sharePaise: 60000 },
    status: 'active',
    createdAt: '2026-09-30T16:15:00.000Z',
    updatedAt: '2026-09-30T16:15:00.000Z',
    updatedBy: null,
    permissions: { canEdit: true, canDelete: true, frozenReason: null },
    ...overrides,
  };
}

const groupApi = (extra = {}) => ({
  ...loggedIn(),
  'GET /api/groups/3': () => json(200, groupFixture()),
  ...extra,
});

describe('§8 expense form — add', () => {
  it('equal split previews shares with the remainder note, then saves', async () => {
    const api = fakeServer(
      groupApi({
        'POST /api/groups/3/expenses': () => json(201, expenseFixture({ expenseId: 50 })),
        'GET /api/groups/3/expenses/50': () => json(200, expenseFixture({ expenseId: 50 })),
        'GET /api/groups/3/expenses/50/history': () => json(200, { items: [] }),
      }),
    );
    const router = renderAt('/groups/3/expenses/new');
    await userEvent.type(await screen.findByLabelText('Description *'), 'Groceries');
    await userEvent.type(screen.getByLabelText('Amount (₹) *'), '100');
    expect(await screen.findByText(/each/)).toHaveTextContent('₹100.00 ÷ 3 = ₹33.33 each');
    expect(screen.getByText(/pays/)).toHaveTextContent('Karan Mehta pays ₹0.01 extra');
    expect(screen.getAllByText('→ ₹33.33')).toHaveLength(2);
    expect(screen.getByText('→ ₹33.34')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Save expense' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/groups/3/expenses/50'));
    expect(sentBodies(api, 'POST', '/api/groups/3/expenses')).toEqual([
      {
        description: 'Groceries',
        notes: '',
        amountPaise: 10000,
        expenseDate: todayIST(),
        payerMembershipId: 1,
        splitMethod: 'equal',
        participants: [{ membershipId: 1 }, { membershipId: 2 }, { membershipId: 3 }],
        confirm: false,
      },
    ]);
  });

  it('exact split: shows what is left and blocks save until it is zero', async () => {
    fakeServer(groupApi());
    renderAt('/groups/3/expenses/new');
    await userEvent.type(await screen.findByLabelText('Description *'), 'Cab');
    await userEvent.type(screen.getByLabelText('Amount (₹) *'), '1200');
    await userEvent.click(screen.getByLabelText('Exact amounts'));
    await userEvent.type(screen.getByLabelText('Amount for Karan Mehta'), '500');
    await userEvent.type(screen.getByLabelText('Amount for Priya Sharma'), '600');
    expect(screen.getByText(/left to assign/)).toHaveTextContent('₹100.00 left to assign');
    expect(screen.getByRole('button', { name: 'Save expense' })).toBeDisabled();

    await userEvent.type(screen.getByLabelText('Amount for Ravi Kumar'), '200');
    expect(screen.getByText(/over the total/)).toHaveTextContent('₹100.00 over the total');
    await userEvent.clear(screen.getByLabelText('Amount for Ravi Kumar'));
    await userEvent.type(screen.getByLabelText('Amount for Ravi Kumar'), '100');
    expect(screen.getByText(/assigned/)).toHaveTextContent('₹1,200.00 assigned');
    expect(screen.getByRole('button', { name: 'Save expense' })).toBeEnabled();
  });

  it('percentage split shows remaining percent; 0 unticks the person (FR-SPL-04)', async () => {
    fakeServer(groupApi());
    renderAt('/groups/3/expenses/new');
    await userEvent.type(await screen.findByLabelText('Amount (₹) *'), '1000');
    await userEvent.click(screen.getByLabelText('Percentage'));
    await userEvent.type(screen.getByLabelText('Percent for Karan Mehta'), '50');
    expect(screen.getByText(/left to assign/)).toHaveTextContent('50.00% left to assign');
    await userEvent.type(screen.getByLabelText('Percent for Ravi Kumar'), '0');
    await userEvent.tab();
    expect(screen.getByRole('checkbox', { name: 'Ravi Kumar' })).not.toBeChecked();
  });

  it('server error codes appear on the form', async () => {
    fakeServer(
      groupApi({
        'POST /api/groups/3/expenses': () =>
          apiError(409, 'PAYER_NOT_ACTIVE', 'The payer is no longer in this group.'),
      }),
    );
    renderAt('/groups/3/expenses/new');
    await userEvent.type(await screen.findByLabelText('Description *'), 'Cab');
    await userEvent.type(screen.getByLabelText('Amount (₹) *'), '10');
    await userEvent.click(screen.getByRole('button', { name: 'Save expense' }));
    expect(await screen.findByText('The payer is no longer in this group.')).toBeInTheDocument();
  });
});

describe('§8 expense form — edit', () => {
  it('prefills, locks the split method and confirms when settlements exist (FR-EXP-09)', async () => {
    let calls = 0;
    const api = fakeServer(
      groupApi({
        'GET /api/groups/3/expenses/41': () => json(200, expenseFixture()),
        'GET /api/groups/3/expenses/41/history': () => json(200, { items: [] }),
        'PUT /api/groups/3/expenses/41': () =>
          ++calls === 1
            ? apiError(409, 'CONFIRMATION_REQUIRED', 'x', {
                details: { reason: 'SETTLEMENT_EXISTS', settlementCount: 2 },
              })
            : json(200, expenseFixture({ amountPaise: 100000 })),
      }),
    );
    const router = renderAt('/groups/3/expenses/41/edit');
    expect(await screen.findByDisplayValue('Dinner at Thalassa')).toBeInTheDocument();
    expect(screen.getByDisplayValue('1200.00')).toBeInTheDocument();
    expect(screen.getByLabelText('Percent for Karan Mehta')).toHaveValue('50.00');
    expect(screen.getByText("Split method can't be changed")).toBeInTheDocument();
    expect(screen.getByLabelText('Equal')).toBeDisabled();

    await userEvent.clear(screen.getByLabelText('Amount (₹) *'));
    await userEvent.type(screen.getByLabelText('Amount (₹) *'), '1000');
    await userEvent.click(screen.getByRole('button', { name: 'Save expense' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/2 payment\(s\) were recorded/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save anyway' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/groups/3/expenses/41'));
    expect(sentBodies(api, 'PUT', '/api/groups/3/expenses/41').map((b) => b.confirm)).toEqual([
      false,
      true,
    ]);
  });

  it('frozen expense shows why and disables saving', async () => {
    fakeServer(
      groupApi({
        'GET /api/groups/3/expenses/41': () =>
          json(
            200,
            expenseFixture({
              permissions: {
                canEdit: false,
                canDelete: false,
                frozenReason: 'INVOLVES_DEPARTED_MEMBER',
              },
            }),
          ),
      }),
    );
    renderAt('/groups/3/expenses/41/edit');
    expect(await screen.findByText(/someone involved has left/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save expense' })).toBeDisabled();
  });
});

describe('§9 expense list and detail', () => {
  it('lists with truncated descriptions, my share and a lock for frozen rows; search goes to the URL', async () => {
    const api = fakeServer(
      groupApi({
        'GET /api/groups/3/expenses': () =>
          json(200, {
            items: [
              expenseFixture({
                description: 'Scooter rental for three days from the beach shack',
                myShare: null,
              }),
              expenseFixture({
                expenseId: 42,
                description: 'Groceries',
                payer: ref(3, 'Ravi Kumar', 'left'),
                permissions: {
                  canEdit: false,
                  canDelete: false,
                  frozenReason: 'INVOLVES_DEPARTED_MEMBER',
                },
              }),
            ],
            page: 1,
            pageSize: 20,
            total: 2,
          }),
      }),
    );
    const router = renderAt('/groups/3/expenses');
    expect(await screen.findByText('Scooter rental for three days from the…')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('Ravi Kumar (left)')).toBeInTheDocument();
    expect(screen.getByLabelText("Can't be changed")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Search description or notes'), 'tip');
    await waitFor(() => expect(router.state.location.search).toBe('?q=tip'));
    await waitFor(() =>
      expect(api.mock.calls.some(([url]) => url === '/api/groups/3/expenses?q=tip&page=1')).toBe(
        true,
      ),
    );
  });

  it('detail: shares, history diff, delete for the creator', async () => {
    const api = fakeServer(
      groupApi({
        'GET /api/groups/3/expenses/41': () => json(200, expenseFixture({ createdBy: KARAN })),
        'GET /api/groups/3/expenses/41/history': () =>
          json(200, {
            items: [
              {
                id: 1,
                action: 'created',
                actor: PRIYA,
                createdAt: '2026-09-30T16:15:00.000Z',
                before: null,
                after: {},
              },
              {
                id: 2,
                action: 'updated',
                actor: KARAN,
                createdAt: '2026-09-30T16:40:00.000Z',
                before: { amountPaise: 100000, shares: [{ membershipId: 1, sharePaise: 50000 }] },
                after: { amountPaise: 120000, shares: [{ membershipId: 1, sharePaise: 60000 }] },
              },
            ],
          }),
        'DELETE /api/groups/3/expenses/41': () => json(204),
        'GET /api/groups/3/expenses': () =>
          json(200, { items: [], page: 1, pageSize: 20, total: 0 }),
      }),
    );
    const router = renderAt('/groups/3/expenses/41');
    expect(await screen.findByText('Amount ₹1,000.00 → ₹1,200.00')).toBeInTheDocument();
    expect(screen.getByText('Karan Mehta share ₹500.00 → ₹600.00')).toBeInTheDocument();
    expect(screen.getByText('50.00%')).toBeInTheDocument();
    expect(screen.getByText('(paid)')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await userEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe('/groups/3/expenses'));
    expect(api).toHaveBeenCalledWith(
      '/api/groups/3/expenses/41',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('deleted expense shows a banner and no actions', async () => {
    fakeServer(
      groupApi({
        'GET /api/groups/3/expenses/41': () =>
          json(
            200,
            expenseFixture({
              status: 'deleted',
              createdBy: KARAN,
              permissions: { canEdit: false, canDelete: false, frozenReason: null },
            }),
          ),
        'GET /api/groups/3/expenses/41/history': () =>
          json(200, {
            items: [
              {
                id: 3,
                action: 'deleted',
                actor: KARAN,
                createdAt: '2026-10-01T03:30:00.000Z',
                before: {},
                after: null,
              },
            ],
          }),
      }),
    );
    renderAt('/groups/3/expenses/41');
    expect(
      await screen.findByText(/This expense was deleted by Karan Mehta on 1 Oct 2026, 09:00/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('diffLines covers payer, added and removed people', () => {
    const name = (id) => ({ 1: 'Karan', 2: 'Priya', 3: 'Ravi' })[id];
    const lines = diffLines(
      {
        payerMembershipId: 2,
        shares: [
          { membershipId: 1, sharePaise: 100 },
          { membershipId: 3, sharePaise: 100 },
        ],
      },
      {
        payerMembershipId: 1,
        shares: [
          { membershipId: 1, sharePaise: 100 },
          { membershipId: 2, sharePaise: 100 },
        ],
      },
      name,
    );
    expect(lines).toEqual([
      'Paid by Priya → Karan',
      'Ravi removed (was ₹1.00)',
      'Priya added (₹1.00)',
    ]);
  });
});

describe('§10–§11 balances and settle up', () => {
  const balances = {
    pairs: [
      { from: KARAN, to: PRIYA, amountPaise: 70000 },
      { from: RAVI, to: KARAN, amountPaise: 50000 },
    ],
    me: {
      netPaise: -20000,
      youOwe: [{ to: PRIYA, amountPaise: 70000 }],
      owesYou: [{ from: RAVI, amountPaise: 50000 }],
    },
  };

  it('settle up from the balances tab prefills and handles over-payment confirmation', async () => {
    let calls = 0;
    const api = fakeServer(
      groupApi({
        'GET /api/groups/3/balances': () => json(200, balances),
        'POST /api/groups/3/settlements': () =>
          ++calls === 1
            ? apiError(409, 'CONFIRMATION_REQUIRED', 'x', {
                details: { reason: 'OVERPAYMENT', owedPaise: 70000, amountPaise: 100000 },
              })
            : json(201, {}),
      }),
    );
    renderAt('/groups/3/balances');
    expect(await screen.findByText(/You owe Priya Sharma/)).toBeInTheDocument();
    expect(screen.getByText('Ravi Kumar → Karan Mehta')).toBeInTheDocument();

    // Header and "Your position" both offer Settle up; use the one in the card.
    await userEvent.click(screen.getAllByRole('button', { name: 'Settle up' }).at(-1));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Amount (₹) *')).toHaveValue('700.00');
    expect(within(dialog).getByText('Currently owed: ₹700.00')).toBeInTheDocument();

    await userEvent.clear(within(dialog).getByLabelText('Amount (₹) *'));
    await userEvent.type(within(dialog).getByLabelText('Amount (₹) *'), '1000');
    await userEvent.type(within(dialog).getByLabelText('Note'), 'UPI');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Record payment' }));

    const warning = await screen.findByRole('alertdialog');
    expect(warning).toHaveTextContent(
      "Karan owes Priya ₹700.00, but you're recording ₹1,000.00. Afterwards Priya will owe Karan ₹300.00.",
    );
    await userEvent.click(within(warning).getByRole('button', { name: 'Record anyway' }));
    await waitFor(() =>
      expect(sentBodies(api, 'POST', '/api/groups/3/settlements')).toHaveLength(2),
    );
    expect(sentBodies(api, 'POST', '/api/groups/3/settlements')[1]).toEqual({
      fromMembershipId: 1,
      toMembershipId: 2,
      amountPaise: 100000,
      settlementDate: todayIST(),
      note: 'UPI',
      confirm: true,
    });
    expect(
      await screen.findByText('Payment recorded. Priya will be notified.'),
    ).toBeInTheDocument();
  });

  it('header Settle up prefills the largest debt', async () => {
    fakeServer(
      groupApi({
        'GET /api/groups/3/balances': () => json(200, balances),
        'GET /api/groups/3/expenses': () =>
          json(200, { items: [], page: 1, pageSize: 20, total: 0 }),
      }),
    );
    renderAt('/groups/3/expenses');
    await userEvent.click(await screen.findByRole('button', { name: 'Settle up' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() =>
      expect(within(dialog).getByLabelText('Amount (₹) *')).toHaveValue('700.00'),
    );
  });

  it('breakdown dialog lists records and the net', async () => {
    fakeServer(
      groupApi({
        'GET /api/groups/3/balances': () => json(200, balances),
        'GET /api/groups/3/balances/breakdown': () =>
          json(200, {
            netPaise: 70000,
            from: KARAN,
            to: PRIYA,
            items: [
              {
                kind: 'expense',
                id: 41,
                date: '2026-09-30',
                description: 'Dinner',
                paidBy: PRIYA,
                effectPaise: 100000,
              },
              {
                kind: 'settlement',
                id: 5,
                date: '2026-09-29',
                note: 'UPI',
                paidBy: KARAN,
                effectPaise: -30000,
              },
            ],
          }),
      }),
    );
    renderAt('/groups/3/balances');
    await userEvent.click((await screen.findAllByRole('button', { name: 'Details' }))[0]);
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Dinner')).toBeInTheDocument();
    expect(
      within(dialog).getByText((_, el) => el?.tagName === 'TD' && el.textContent === '−₹300.00'),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(/Karan owes Priya/)).toBeInTheDocument();
  });

  it('settlements tab: parties can open edit / delete', async () => {
    const settlement = {
      settlementId: 5,
      groupId: 3,
      from: KARAN,
      to: PRIYA,
      amountPaise: 70000,
      settlementDate: '2026-10-01',
      note: 'UPI',
      recordedBy: KARAN,
      status: 'active',
      permissions: { canEdit: true, canDelete: true, frozenReason: null },
    };
    const api = fakeServer(
      groupApi({
        'GET /api/groups/3/settlements': () =>
          json(200, { items: [settlement], page: 1, pageSize: 20, total: 1 }),
        'GET /api/groups/3/balances': () => json(200, balances),
        'DELETE /api/groups/3/settlements/5': () => json(204),
      }),
    );
    renderAt('/groups/3/settlements');
    expect(await screen.findByText('Karan Mehta (you)')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Payment actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit / delete' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Edit payment' })).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await userEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }),
    );
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        '/api/groups/3/settlements/5',
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
  });
});

describe('activity tab', () => {
  it('lists events with links to expenses', async () => {
    fakeServer(
      groupApi({
        'GET /api/groups/3/activity': () =>
          json(200, {
            items: [
              {
                id: 9,
                type: 'expense_updated',
                actor: KARAN,
                subject: { type: 'expense', id: 41 },
                summary: "Karan edited 'Dinner'",
                createdAt: '2026-09-30T16:40:00.000Z',
              },
              {
                id: 8,
                type: 'member_left',
                actor: RAVI,
                subject: { type: 'membership', id: 3 },
                summary: 'Ravi left the group',
                createdAt: '2026-09-29T04:32:00.000Z',
              },
            ],
            page: 1,
            pageSize: 20,
            total: 2,
          }),
      }),
    );
    renderAt('/groups/3/activity');
    expect(await screen.findByText("Karan edited 'Dinner'")).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'open' })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'open' })).toHaveAttribute(
      'href',
      '/groups/3/expenses/41',
    );
  });
});
