import { useState } from 'react';
import { Link } from 'react-router';
import { activityApi } from '@/api/endpoints.js';
import { useRequest } from '@/hooks/useRequest.js';
import {
  EmptyState,
  ErrorState,
  LoadingRows,
  Pager,
  useRefetchOnFocus,
} from '@/components/common.jsx';
import { formatDateTime } from '@/lib/format.js';
import { useGroup } from '../groups/GroupContext.jsx';

/** Group activity feed (WIREFRAMES §14, AC1, FR-ACT-01). */
export function ActivityTab() {
  const { group } = useGroup();
  const [page, setPage] = useState(1);
  const { data, error, loading, refetch } = useRequest(
    (opts) => activityApi.list(group.groupId, { page }, opts),
    [group.groupId, page],
  );
  useRefetchOnFocus(refetch);

  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (loading && !data) return <LoadingRows />;
  if (data.total === 0) return <EmptyState title="No activity yet." />;

  const linkOf = (subject) => {
    if (subject?.type === 'expense') return `/groups/${group.groupId}/expenses/${subject.id}`;
    if (subject?.type === 'settlement') return `/groups/${group.groupId}/settlements`;
    return null;
  };

  return (
    <div>
      <ul className="divide-y rounded-md border text-sm">
        {data.items.map((a) => {
          const to = linkOf(a.subject);
          return (
            <li key={a.id} className="grid grid-cols-[11rem_1fr_auto] items-center gap-4 px-4 py-2">
              <span className="text-muted-foreground">{formatDateTime(a.createdAt)}</span>
              <span>{a.summary}</span>
              {to ? (
                <Link to={to} className="text-xs underline underline-offset-4">
                  open
                </Link>
              ) : (
                <span />
              )}
            </li>
          );
        })}
      </ul>
      <Pager page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />
    </div>
  );
}
