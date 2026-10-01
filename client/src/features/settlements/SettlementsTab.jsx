import { useState } from 'react';
import { LockIcon, MoreHorizontalIcon } from 'lucide-react';
import { settlementsApi } from '@/api/endpoints.js';
import { useRequest } from '@/hooks/useRequest.js';
import {
  EmptyState,
  ErrorState,
  LoadingRows,
  Money,
  Pager,
  useRefetchOnFocus,
} from '@/components/common.jsx';
import { formatDate, formatDateTime, formatPaise, memberLabel } from '@/lib/format.js';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useGroup } from '../groups/GroupContext.jsx';
import { SettleUpDialog } from './SettleUpDialog.jsx';

/** WIREFRAMES §11.2 — S1 list; parties can edit/delete (FR-STL-05/07/09). */
export function SettlementsTab() {
  const { group, refetchGroup } = useGroup();
  const [page, setPage] = useState(1);
  const { data, error, loading, refetch } = useRequest(
    (opts) => settlementsApi.list(group.groupId, { page }, opts),
    [group.groupId, page],
  );
  useRefetchOnFocus(refetch);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const me = group.me.membershipId;
  const you = (m) => `${memberLabel(m)}${m.membershipId === me ? ' (you)' : ''}`;

  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (loading && !data) return <LoadingRows />;
  if (data.total === 0) return <EmptyState title="No payments recorded yet." />;

  return (
    <div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>From</TableHead>
              <TableHead>To</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Note</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((s) => (
              <TableRow
                key={s.settlementId}
                className="cursor-pointer"
                onClick={() => setViewing(s)}
              >
                <TableCell>{formatDate(s.settlementDate)}</TableCell>
                <TableCell>
                  {you(s.from)}
                  {s.permissions.frozenReason && (
                    <LockIcon
                      className="ml-1 inline size-3 text-muted-foreground"
                      aria-label="Can't be changed"
                    />
                  )}
                </TableCell>
                <TableCell>{you(s.to)}</TableCell>
                <TableCell className="text-right">
                  <Money paise={s.amountPaise} />
                </TableCell>
                <TableCell className="text-muted-foreground">{s.note || '—'}</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  {s.permissions.canEdit && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Payment actions">
                          <MoreHorizontalIcon className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setEditing(s)}>
                          Edit / delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Pager page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />

      <SettleUpDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        group={group}
        settlement={editing}
        onSaved={() => {
          refetch();
          refetchGroup();
        }}
      />
      <SettlementDetailDialog settlement={viewing} group={group} onClose={() => setViewing(null)} />
    </div>
  );
}

/** Row click → detail with history (S3, S6). */
function SettlementDetailDialog({ settlement, group, onClose }) {
  const { data } = useRequest(
    (opts) => settlementsApi.history(group.groupId, settlement.settlementId, opts),
    [group.groupId, settlement?.settlementId],
    { enabled: settlement !== null },
  );
  const nameOf = (id) =>
    [...group.members, ...group.pastMembers].find((m) => m.membershipId === id)?.name ??
    `Member #${id}`;
  return (
    <Dialog open={settlement !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        {settlement && (
          <>
            <DialogHeader>
              <DialogTitle>
                {memberLabel(settlement.from)} paid {memberLabel(settlement.to)}{' '}
                <Money paise={settlement.amountPaise} />
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              {formatDate(settlement.settlementDate)} · {settlement.note || 'No note'} · Recorded by{' '}
              {memberLabel(settlement.recordedBy)}
            </p>
            <ul className="space-y-2 text-sm">
              {(data?.items ?? []).map((h) => (
                <li key={h.id}>
                  <span className="text-muted-foreground">{formatDateTime(h.createdAt)}</span> ·{' '}
                  {memberLabel(h.actor)} {h.action}
                  {h.action === 'updated' &&
                    h.before.amountPaise !== h.after.amountPaise &&
                    ` (${formatPaise(h.before.amountPaise)} → ${formatPaise(h.after.amountPaise)})`}
                  {h.action === 'updated' &&
                    h.before.toMembershipId !== h.after.toMembershipId &&
                    ` (to ${nameOf(h.before.toMembershipId)} → ${nameOf(h.after.toMembershipId)})`}
                </li>
              ))}
            </ul>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
