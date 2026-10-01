import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { LockIcon } from 'lucide-react';
import { rupeesToPaise } from '@splitbook/shared';
import { expensesApi } from '@/api/endpoints.js';
import { useRequest } from '@/hooks/useRequest.js';
import {
  DateField,
  EmptyState,
  ErrorState,
  LoadingRows,
  Money,
  Pager,
  useDebounced,
  useRefetchOnFocus,
} from '@/components/common.jsx';
import { formatDate, memberLabel, truncate } from '@/lib/format.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useGroup } from '../groups/GroupContext.jsx';

/** WIREFRAMES §9.1 — E1 with search / date / amount filters kept in the URL (FR-EXP-13). */
export function ExpensesTab() {
  const { group } = useGroup();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [qInput, setQInput] = useState(params.get('q') ?? '');
  const [amountInput, setAmountInput] = useState(params.get('amount') ?? '');
  const q = useDebounced(qInput.trim());
  const amount = useDebounced(amountInput.trim());
  const date = params.get('date') ?? '';
  const page = Number(params.get('page') ?? 1);
  const amountPaise = amount ? rupeesToPaise(amount) : undefined;

  const update = (changes) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next, { replace: true });
  };

  const query = {
    q: q || undefined,
    date: date || undefined,
    amountPaise: amountPaise || undefined,
    page,
  };
  const { data, error, loading, refetch } = useRequest(
    (opts) => expensesApi.list(group.groupId, query, opts),
    [group.groupId, q, date, amountPaise, page],
  );
  useRefetchOnFocus(refetch);
  const filtering = Boolean(q || date || amountPaise);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Input
          className="max-w-xs"
          placeholder="Search description or notes"
          aria-label="Search description or notes"
          value={qInput}
          onChange={(e) => {
            setQInput(e.target.value);
            update({ q: e.target.value.trim(), page: '' });
          }}
        />
        <div className="w-44">
          <DateField
            value={date}
            onChange={(v) => update({ date: v, page: '' })}
            placeholder="Date"
          />
        </div>
        <Input
          className="w-32"
          placeholder="Amount ₹"
          aria-label="Amount"
          inputMode="decimal"
          value={amountInput}
          onChange={(e) => {
            setAmountInput(e.target.value);
            update({ amount: e.target.value.trim(), page: '' });
          }}
        />
        {filtering && (
          <Button
            variant="ghost"
            onClick={() => {
              setQInput('');
              setAmountInput('');
              setParams({}, { replace: true });
            }}
          >
            Clear
          </Button>
        )}
      </div>

      {error && <ErrorState error={error} onRetry={refetch} />}
      {loading && !data && <LoadingRows />}
      {data?.total === 0 &&
        (filtering ? (
          <EmptyState title="No expenses match your search." />
        ) : (
          <EmptyState title="No expenses yet.">
            <Button asChild>
              <Link to={`/groups/${group.groupId}/expenses/new`}>+ Add expense</Link>
            </Button>
          </EmptyState>
        ))}
      {data?.total > 0 && (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Paid by</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">My share</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((e) => (
                  <TableRow
                    key={e.expenseId}
                    className="cursor-pointer"
                    onClick={() => navigate(`/groups/${group.groupId}/expenses/${e.expenseId}`)}
                  >
                    <TableCell>{formatDate(e.expenseDate)}</TableCell>
                    <TableCell>
                      <Link
                        to={`/groups/${group.groupId}/expenses/${e.expenseId}`}
                        title={e.description}
                      >
                        {truncate(e.description, 40)}
                      </Link>
                      {e.permissions.frozenReason && (
                        <LockIcon
                          className="ml-1 inline size-3 text-muted-foreground"
                          aria-label="Can't be changed"
                        />
                      )}
                    </TableCell>
                    <TableCell
                      className={e.payer.status !== 'active' ? 'text-muted-foreground' : undefined}
                    >
                      {memberLabel(e.payer)}
                      {e.payer.membershipId === group.me.membershipId && ' (you)'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Money paise={e.amountPaise} />
                    </TableCell>
                    <TableCell className="text-right">
                      {e.myShare ? <Money paise={e.myShare.sharePaise} /> : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pager
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            onChange={(p) => update({ page: String(p) })}
          />
        </>
      )}
    </div>
  );
}
