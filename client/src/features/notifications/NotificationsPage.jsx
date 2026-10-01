import { useState } from 'react';
import { useNavigate } from 'react-router';
import { notificationsApi } from '@/api/endpoints.js';
import { useRequest } from '@/hooks/useRequest.js';
import { EmptyState, ErrorState, LoadingRows, PageHeader, Pager } from '@/components/common.jsx';
import { formatDateTime } from '@/lib/format.js';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { announceNotificationsChanged, notificationPath } from './notificationLinks.js';

/** WIREFRAMES §12.2 — N1 with All/Unread, mark read (N3/N4). */
export function NotificationsPage() {
  const navigate = useNavigate();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);
  const { data, error, loading, refetch } = useRequest(
    (opts) => notificationsApi.list({ unreadOnly: unreadOnly ? 'true' : undefined, page }, opts),
    [unreadOnly, page],
  );

  const open = async (n) => {
    const path = notificationPath(n.link);
    if (!path) return;
    if (!n.read) await notificationsApi.markRead(n.notificationId).catch(() => {});
    announceNotificationsChanged();
    navigate(path);
  };

  const markAll = async () => {
    await notificationsApi.markAllRead();
    announceNotificationsChanged();
    refetch();
  };

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Notifications"
        actions={
          <>
            <Tabs
              value={unreadOnly ? 'unread' : 'all'}
              onValueChange={(v) => {
                setUnreadOnly(v === 'unread');
                setPage(1);
              }}
            >
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="unread">Unread</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button variant="outline" onClick={markAll}>
              Mark all as read
            </Button>
          </>
        }
      />
      {error && <ErrorState error={error} onRetry={refetch} />}
      {loading && !data && <LoadingRows />}
      {data?.total === 0 && <EmptyState title="You're all caught up." />}
      {data?.total > 0 && (
        <>
          <ul className="divide-y rounded-md border text-sm">
            {data.items.map((n) => {
              const clickable = notificationPath(n.link) !== null;
              return (
                <li key={n.notificationId}>
                  <button
                    type="button"
                    disabled={!clickable}
                    onClick={() => open(n)}
                    className={cn(
                      'grid w-full grid-cols-[1rem_1fr_10rem_10rem] items-center gap-3 px-4 py-3 text-left',
                      clickable ? 'hover:bg-muted/60' : 'cursor-default text-muted-foreground',
                      !n.read && 'font-medium',
                    )}
                  >
                    <span
                      className={cn(
                        'size-2 rounded-full',
                        n.read ? 'bg-transparent' : 'bg-primary',
                      )}
                    />
                    <span>{n.message}</span>
                    <span className="flex items-center gap-2 font-normal text-muted-foreground">
                      {n.groupName}
                      {!n.link && <Badge variant="outline">Group deleted</Badge>}
                    </span>
                    <span className="text-right font-normal text-muted-foreground">
                      {formatDateTime(n.createdAt)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <Pager page={data.page} pageSize={data.pageSize} total={data.total} onChange={setPage} />
        </>
      )}
    </div>
  );
}
