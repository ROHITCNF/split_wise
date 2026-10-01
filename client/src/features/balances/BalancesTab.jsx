import { useState } from 'react';
import { Link } from 'react-router';
import { balancesApi } from '@/api/endpoints.js';
import { useRequest } from '@/hooks/useRequest.js';
import {
  BalanceText,
  ErrorState,
  LoadingRows,
  Money,
  useRefetchOnFocus,
} from '@/components/common.jsx';
import { formatDate, memberLabel } from '@/lib/format.js';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useGroup } from '../groups/GroupContext.jsx';
import { SettleUpDialog } from '../settlements/SettleUpDialog.jsx';

/** WIREFRAMES §10.1 — B1 (FR-BAL-01..03). */
export function BalancesTab() {
  const { group, refetchGroup } = useGroup();
  const { data, error, loading, refetch } = useRequest(
    (opts) => balancesApi.get(group.groupId, opts),
    [group.groupId],
  );
  useRefetchOnFocus(refetch);
  const [settle, setSettle] = useState(null);
  const [breakdown, setBreakdown] = useState(null);
  const me = group.me.membershipId;

  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (loading && !data) return <LoadingRows />;

  const first = (m) => m.name.split(' ')[0];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Your position</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            Net: <BalanceText netPaise={data.me.netPaise} className="font-medium" />
          </div>
          {data.me.youOwe.map((row) => (
            <div key={row.to.membershipId} className="flex items-center justify-between">
              <span>
                You owe {memberLabel(row.to)} <Money paise={row.amountPaise} className="text-owe" />
              </span>
              <span className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() =>
                    setSettle({
                      fromMembershipId: me,
                      toMembershipId: row.to.membershipId,
                      amountPaise: row.amountPaise,
                    })
                  }
                >
                  Settle up
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setBreakdown({ a: me, b: row.to.membershipId })}
                >
                  Details
                </Button>
              </span>
            </div>
          ))}
          {data.me.owesYou.map((row) => (
            <div key={row.from.membershipId} className="flex items-center justify-between">
              <span>
                {memberLabel(row.from)} owes you{' '}
                <Money paise={row.amountPaise} className="text-owed" />
              </span>
              <span className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setSettle({
                      fromMembershipId: row.from.membershipId,
                      toMembershipId: me,
                      amountPaise: row.amountPaise,
                    })
                  }
                >
                  Record payment
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setBreakdown({ a: row.from.membershipId, b: me })}
                >
                  Details
                </Button>
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All balances in this group</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {data.pairs.length === 0 && (
            <p className="text-muted-foreground">Everyone is settled up 🎉</p>
          )}
          {data.pairs.map((p) => (
            <div
              key={`${p.from.membershipId}-${p.to.membershipId}`}
              className="flex items-center justify-between"
            >
              <span>
                {memberLabel(p.from)} → {memberLabel(p.to)}{' '}
                <Money paise={p.amountPaise} className="ml-2 font-medium" />
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setBreakdown({ a: p.from.membershipId, b: p.to.membershipId })}
              >
                Details
              </Button>
            </div>
          ))}
          <p className="pt-2 text-xs text-muted-foreground">
            &quot;A → B ₹X&quot; means A owes B. Amounts are netted per pair.
          </p>
        </CardContent>
      </Card>

      <SettleUpDialog
        open={settle !== null}
        onOpenChange={(o) => !o && setSettle(null)}
        group={group}
        initial={settle}
        onSaved={() => {
          refetch();
          refetchGroup();
        }}
      />
      <BreakdownDialog
        pair={breakdown}
        group={group}
        onClose={() => setBreakdown(null)}
        first={first}
      />
    </div>
  );
}

/** WIREFRAMES §10.2 — B2: records behind one pair's balance (FR-BAL-05). */
function BreakdownDialog({ pair, group, onClose, first }) {
  const { data, loading } = useRequest(
    (opts) => balancesApi.breakdown(group.groupId, pair.a, pair.b, opts),
    [group.groupId, pair?.a, pair?.b],
    { enabled: pair !== null },
  );
  return (
    <Dialog open={pair !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {data ? (
              <>
                {memberLabel(data.from)} → {memberLabel(data.to)} · <Money paise={data.netPaise} />
              </>
            ) : (
              'Balance details'
            )}
          </DialogTitle>
        </DialogHeader>
        {loading && !data && <LoadingRows rows={3} />}
        {data && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Effect</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((item) => (
                <TableRow key={`${item.kind}-${item.id}`}>
                  <TableCell>{formatDate(item.date)}</TableCell>
                  <TableCell>
                    {item.kind === 'expense' ? (
                      <Link
                        to={`/groups/${group.groupId}/expenses/${item.id}`}
                        className="underline underline-offset-4"
                        onClick={onClose}
                      >
                        {item.description}
                      </Link>
                    ) : (
                      <Link
                        to={`/groups/${group.groupId}/settlements`}
                        className="underline underline-offset-4"
                        onClick={onClose}
                      >
                        {item.note || 'Payment'}
                      </Link>
                    )}{' '}
                    <span className="text-muted-foreground">
                      ({item.kind}
                      {item.kind === 'settlement' && `, ${first(item.paidBy)} paid`})
                    </span>
                  </TableCell>
                  <TableCell
                    className={cn('text-right tabular-nums', item.effectPaise < 0 && 'text-owed')}
                  >
                    {item.effectPaise > 0 ? '+' : '−'}
                    <Money paise={Math.abs(item.effectPaise)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={2}>Net</TableCell>
                <TableCell className="text-right">
                  <Money paise={data.netPaise} /> {first(data.from)} owes {first(data.to)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
