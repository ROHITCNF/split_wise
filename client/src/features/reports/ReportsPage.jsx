import { useState } from 'react';
import { DownloadIcon } from 'lucide-react';
import { todayIST } from '@splitbook/shared';
import { groupsApi, reportsApi } from '@/api/endpoints.js';
import { useRequest } from '@/hooks/useRequest.js';
import { EmptyState, ErrorState, LoadingRows, Money, PageHeader } from '@/components/common.jsx';
import { formatDate, memberLabel } from '@/lib/format.js';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

/** Shift a "YYYY-MM-DD" by days or months (UTC maths, no time-zone drift). */
export function shiftDate(value, { days = 0, months = 0 }) {
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1 + months, months ? 1 : d + days));
  return date.toISOString().slice(0, 10);
}

/** WIREFRAMES §13 — R1 / R2 (FR-RPT-01..07). */
export function ReportsPage() {
  const [period, setPeriod] = useState('week');
  const [date, setDate] = useState(todayIST());
  const [groupId, setGroupId] = useState('all');
  const query = { period, date, groupId: groupId === 'all' ? undefined : groupId };

  const groups = useRequest((opts) => groupsApi.list(opts), []);
  const { data, error, loading, refetch } = useRequest(
    (opts) => reportsApi.get(query, opts),
    [period, date, groupId],
  );

  const isCurrent = data ? data.period.to >= todayIST() : true;
  const step = (direction) =>
    setDate(
      shiftDate(
        data.period.from,
        period === 'week' ? { days: 7 * direction } : { months: direction },
      ),
    );

  return (
    <div>
      <PageHeader title="Reports" />
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <Tabs value={period} onValueChange={setPeriod}>
          <TabsList>
            <TabsTrigger value="week">Week</TabsTrigger>
            <TabsTrigger value="month">Month</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            aria-label="Previous period"
            disabled={!data}
            onClick={() => step(-1)}
          >
            ‹
          </Button>
          <span className="min-w-48 text-center text-sm font-medium">
            {data?.period.label ?? '…'}
          </span>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Next period"
            disabled={!data || isCurrent}
            onClick={() => step(1)}
          >
            ›
          </Button>
        </div>
        <Select value={groupId} onValueChange={setGroupId}>
          <SelectTrigger className="w-48" aria-label="Group">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All groups</SelectItem>
            {groups.data?.items.map((g) => (
              <SelectItem key={g.groupId} value={String(g.groupId)}>
                {g.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" className="ml-auto" asChild>
          <a href={reportsApi.csvUrl(query)} download>
            <DownloadIcon className="size-4" /> CSV
          </a>
        </Button>
      </div>

      {error && <ErrorState error={error} onRetry={refetch} />}
      {loading && !data && <LoadingRows rows={6} />}
      {data && (
        <div className="space-y-6">
          <div className="grid grid-cols-4 gap-4">
            <Stat label="You paid" paise={data.totals.paidPaise} />
            <Stat label="Your share" paise={data.totals.mySharePaise} />
            <Stat label="Payments you made" paise={data.totals.settlementsPaidPaise} />
            <Stat label="Payments received" paise={data.totals.settlementsReceivedPaise} />
          </div>

          {data.expenses.length === 0 && data.settlements.length === 0 ? (
            <EmptyState title="No expenses or payments in this period." />
          ) : (
            <>
              <section className="space-y-2">
                <h2 className="text-lg font-semibold">Expenses</h2>
                {data.expenses.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No expenses.</p>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Group</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Paid by</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead className="text-right">My share</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.expenses.map((e) => (
                          <TableRow key={e.expenseId}>
                            <TableCell>{formatDate(e.date)}</TableCell>
                            <TableCell>{e.groupName}</TableCell>
                            <TableCell>{e.description}</TableCell>
                            <TableCell>{memberLabel(e.payer)}</TableCell>
                            <TableCell className="text-right">
                              <Money paise={e.amountPaise} />
                            </TableCell>
                            <TableCell className="text-right">
                              {e.mySharePaise ? <Money paise={e.mySharePaise} /> : '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </section>
              <section className="space-y-2">
                <h2 className="text-lg font-semibold">Settlements</h2>
                {data.settlements.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No payments.</p>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableBody>
                        {data.settlements.map((s) => (
                          <TableRow key={s.settlementId}>
                            <TableCell>{formatDate(s.date)}</TableCell>
                            <TableCell>{s.groupName}</TableCell>
                            <TableCell>
                              {memberLabel(s.from)} → {memberLabel(s.to)}
                            </TableCell>
                            <TableCell className="text-right">
                              <Money paise={s.amountPaise} />
                            </TableCell>
                            <TableCell className="text-muted-foreground">{s.note || '—'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, paise }) {
  return (
    <Card>
      <CardContent>
        <div className="text-sm text-muted-foreground">{label}</div>
        <Money paise={paise} className="mt-1 block text-xl font-semibold" />
      </CardContent>
    </Card>
  );
}
