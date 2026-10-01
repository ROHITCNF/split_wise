import { Link } from 'react-router';
import { ChevronRightIcon, PlusIcon } from 'lucide-react';
import { dashboardApi } from '@/api/endpoints.js';
import { useRequest } from '@/hooks/useRequest.js';
import {
  BalanceText,
  EmptyState,
  ErrorState,
  LoadingRows,
  Money,
  PageHeader,
} from '@/components/common.jsx';
import { formatDateTime } from '@/lib/format.js';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/** WIREFRAMES §4 — FR-DSH-01, FR-BAL-04 (D1). */
export function DashboardPage() {
  const { data, error, loading, refetch } = useRequest((opts) => dashboardApi.get(opts), []);

  const newGroup = (
    <Button asChild>
      <Link to="/groups/new">
        <PlusIcon className="size-4" /> New group
      </Link>
    </Button>
  );

  return (
    <div>
      <PageHeader title="Dashboard" actions={newGroup} />
      {error && <ErrorState error={error} onRetry={refetch} />}
      {loading && !data && <LoadingRows rows={6} />}
      {data && (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <StatCard
              label="You owe"
              value={<Money paise={data.totals.youOwePaise} className="text-owe" />}
            />
            <StatCard
              label="Owed to you"
              value={<Money paise={data.totals.owedToYouPaise} className="text-owed" />}
            />
            <StatCard
              label="Net"
              value={
                <span
                  className={
                    data.totals.netPaise < 0
                      ? 'text-owe'
                      : data.totals.netPaise > 0
                        ? 'text-owed'
                        : ''
                  }
                >
                  {data.totals.netPaise > 0 ? '+' : ''}
                  <Money paise={data.totals.netPaise} />
                </span>
              }
            />
          </div>

          {data.groups.length === 0 ? (
            <EmptyState title="You're not in any groups yet.">
              <Button asChild>
                <Link to="/groups/new">Create your first group</Link>
              </Button>
            </EmptyState>
          ) : (
            <div className="grid grid-cols-[3fr_2fr] gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Your groups</CardTitle>
                </CardHeader>
                <CardContent className="divide-y">
                  {data.groups.map((g) => (
                    <Link
                      key={g.groupId}
                      to={`/groups/${g.groupId}/expenses`}
                      className="flex items-center justify-between py-3 text-sm hover:bg-muted/50"
                    >
                      <span className="font-medium">{g.name}</span>
                      <span className="flex items-center gap-4">
                        <span className="text-muted-foreground">{g.memberCount} members</span>
                        <BalanceText netPaise={g.netPaise} />
                        <ChevronRightIcon className="size-4 text-muted-foreground" />
                      </span>
                    </Link>
                  ))}
                  <div className="pt-3 text-right text-sm">
                    <Link to="/groups" className="underline underline-offset-4">
                      View all groups →
                    </Link>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Recent activity</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {data.recentActivity.length === 0 && (
                    <p className="text-sm text-muted-foreground">Nothing yet.</p>
                  )}
                  {data.recentActivity.map((a) => (
                    <Link
                      key={a.id}
                      to={`/groups/${a.groupId}/activity`}
                      className="block text-sm hover:underline"
                    >
                      <div>{a.summary}</div>
                      <div className="text-xs text-muted-foreground">
                        {a.groupName} · {formatDateTime(a.createdAt)}
                      </div>
                    </Link>
                  ))}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <Card>
      <CardContent>
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}
