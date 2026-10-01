import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { LockIcon } from 'lucide-react';
import { bpToPercentString } from '@splitbook/shared';
import { expensesApi } from '@/api/endpoints.js';
import { errorMessage } from '@/api/messages.js';
import { useRequest } from '@/hooks/useRequest.js';
import { useConfirm } from '@/components/ConfirmProvider.jsx';
import { ErrorState, LoadingRows, Money, PageHeader } from '@/components/common.jsx';
import { formatDate, formatDateTime, formatPaise, memberLabel } from '@/lib/format.js';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useGroup } from '../groups/GroupContext.jsx';

const METHOD_LABEL = {
  equal: 'Split equally',
  exact: 'Split by exact amounts',
  percentage: 'Split by percentage',
};

/** WIREFRAMES §9.2 — E3 + E6, edit / delete per permissions. */
export function ExpenseDetailPage() {
  const { expenseId } = useParams();
  const { group, refetchGroup } = useGroup();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const detail = useRequest(
    (opts) => expensesApi.get(group.groupId, expenseId, opts),
    [group.groupId, expenseId],
  );
  const history = useRequest(
    (opts) => expensesApi.history(group.groupId, expenseId, opts),
    [group.groupId, expenseId],
  );
  const expense = detail.data;

  if (detail.error) return <ErrorState error={detail.error} onRetry={detail.refetch} />;
  if (!expense) return <LoadingRows rows={6} />;

  const members = new Map([
    ...group.members.map((m) => [m.membershipId, m]),
    ...group.pastMembers.map((m) => [m.membershipId, m]),
  ]);
  const nameOf = (id) => memberLabel(members.get(id)) || `Member #${id}`;
  const { canEdit, canDelete, frozenReason } = expense.permissions;
  const allowedToChange =
    expense.createdBy.membershipId === group.me.membershipId || group.me.role === 'admin';
  const deletion = history.data?.items.find((h) => h.action === 'deleted');

  const remove = async () => {
    const ok = await confirm({
      title: 'Delete this expense?',
      description:
        "It will no longer count in balances or reports. It stays visible in the group's history.",
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    try {
      await expensesApi.remove(group.groupId, expense.expenseId);
      toast.success('Expense deleted');
      refetchGroup();
      navigate(`/groups/${group.groupId}/expenses`, { replace: true });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const departed = expense.shares
    .map((s) => s.member)
    .concat(expense.payer)
    .filter((m) => m.status !== 'active');

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title={expense.description}
        back={{ to: `/groups/${group.groupId}/expenses`, label: group.name }}
        actions={
          allowedToChange &&
          expense.status === 'active' && (
            <>
              <Button variant="outline" disabled={!canEdit} asChild={canEdit}>
                {canEdit ? <Link to="edit">Edit</Link> : <span>Edit</span>}
              </Button>
              <Button variant="destructive" disabled={!canDelete} onClick={remove}>
                Delete
              </Button>
            </>
          )
        }
      />

      {expense.status === 'deleted' && (
        <Alert>
          <AlertDescription>
            This expense was deleted
            {deletion &&
              ` by ${memberLabel(deletion.actor)} on ${formatDateTime(deletion.createdAt)}`}
            .
          </AlertDescription>
        </Alert>
      )}
      {frozenReason && expense.status === 'active' && (
        <Alert>
          <AlertDescription className="flex items-center gap-2">
            <LockIcon className="size-4" /> Can&apos;t be edited or deleted:{' '}
            {[...new Set(departed.map((m) => m.name.split(' ')[0]))].join(', ')} has left the group.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex items-baseline justify-between">
        <p className="text-sm text-muted-foreground">
          {formatDate(expense.expenseDate)} · Paid by {memberLabel(expense.payer)} ·{' '}
          {METHOD_LABEL[expense.splitMethod]}
        </p>
        <Money paise={expense.amountPaise} className="text-2xl font-semibold" />
      </div>
      {expense.notes && <p className="text-sm">Notes: {expense.notes}</p>}

      <Card>
        <CardHeader>
          <CardTitle>Shares</CardTitle>
        </CardHeader>
        <CardContent className="divide-y text-sm">
          {expense.shares.map((s) => (
            <div
              key={s.member.membershipId}
              className="grid grid-cols-[1fr_6rem_8rem_10rem] items-center py-2"
            >
              <span>
                {memberLabel(s.member)}
                {s.member.membershipId === group.me.membershipId && ' (you)'}
              </span>
              <span className="text-muted-foreground">
                {s.inputBp ? `${bpToPercentString(s.inputBp)}%` : ''}
              </span>
              <Money paise={s.sharePaise} className="text-right" />
              <span className="text-right text-muted-foreground">
                {s.member.membershipId === expense.payer.membershipId
                  ? '(paid)'
                  : `owes ${expense.payer.name.split(' ')[0]}`}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {history.loading && !history.data && <LoadingRows rows={2} />}
          {[...(history.data?.items ?? [])].reverse().map((h) => (
            <div key={h.id} className="grid grid-cols-[10rem_1fr] gap-4">
              <span className="text-muted-foreground">{formatDateTime(h.createdAt)}</span>
              <div>
                <div>
                  {memberLabel(h.actor)}{' '}
                  {h.action === 'created'
                    ? 'added this expense'
                    : h.action === 'deleted'
                      ? 'deleted this expense'
                      : 'edited'}
                </div>
                {h.action === 'updated' && (
                  <ul className="mt-1 space-y-0.5 text-muted-foreground">
                    {diffLines(h.before, h.after, nameOf).map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        Added by {memberLabel(expense.createdBy)}
        {expense.updatedBy &&
          ` · Last edited by ${memberLabel(expense.updatedBy)}, ${formatDateTime(expense.updatedAt)}`}
      </p>
    </div>
  );
}

/** Field-by-field changes between two snapshots (WIREFRAMES §9.2 history). */
export function diffLines(before, after, nameOf) {
  const lines = [];
  const show = (label, a, b, fmt = (x) => x ?? '—') => {
    if (a !== b) lines.push(`${label} ${fmt(a)} → ${fmt(b)}`);
  };
  show('Description', before.description, after.description);
  show('Amount', before.amountPaise, after.amountPaise, formatPaise);
  show('Date', before.expenseDate, after.expenseDate, (d) => (d ? formatDate(d) : '—'));
  show('Paid by', before.payerMembershipId, after.payerMembershipId, nameOf);
  show('Notes', before.notes, after.notes);

  const beforeShares = new Map(before.shares.map((s) => [s.membershipId, s.sharePaise]));
  const afterShares = new Map(after.shares.map((s) => [s.membershipId, s.sharePaise]));
  for (const id of new Set([...beforeShares.keys(), ...afterShares.keys()])) {
    const a = beforeShares.get(id);
    const b = afterShares.get(id);
    if (a === b) continue;
    if (a === undefined) lines.push(`${nameOf(id)} added (${formatPaise(b)})`);
    else if (b === undefined) lines.push(`${nameOf(id)} removed (was ${formatPaise(a)})`);
    else lines.push(`${nameOf(id)} share ${formatPaise(a)} → ${formatPaise(b)}`);
  }
  return lines;
}
