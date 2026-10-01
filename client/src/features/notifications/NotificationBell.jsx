import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { BellIcon } from 'lucide-react';
import { notificationsApi } from '@/api/endpoints.js';
import { usePoller } from '@/hooks/usePoller.js';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  announceNotificationsChanged,
  NOTIFICATIONS_CHANGED,
  notificationPath,
  timeAgo,
} from './notificationLinks.js';

const POLL_MS = 60_000;

/**
 * WIREFRAMES §12.1 — unread badge (N2, polled every 60 s while visible and on
 * navigation, ADR-008) and a popover with the latest 5 (N1).
 */
export function NotificationBell() {
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [latest, setLatest] = useState(null);
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const refresh = useCallback(() => {
    notificationsApi
      .unreadCount()
      .then(({ count: next }) => setCount(next))
      .catch(() => {}); // a missed poll is harmless
  }, []);

  usePoller(refresh, POLL_MS);
  useEffect(refresh, [pathname, refresh]);
  useEffect(() => {
    window.addEventListener(NOTIFICATIONS_CHANGED, refresh);
    return () => window.removeEventListener(NOTIFICATIONS_CHANGED, refresh);
  }, [refresh]);

  const onOpenChange = (next) => {
    setOpen(next);
    if (next) {
      notificationsApi
        .list({ pageSize: 5 })
        .then(({ items }) => setLatest(items))
        .catch(() => setLatest([]));
    }
  };

  const openItem = async (n) => {
    if (!n.read) await notificationsApi.markRead(n.notificationId).catch(() => {});
    setOpen(false);
    refresh();
    const path = notificationPath(n.link);
    if (path) navigate(path);
  };

  const markAll = async () => {
    await notificationsApi.markAllRead().catch(() => {});
    setLatest((items) => items?.map((n) => ({ ...n, read: true })));
    announceNotificationsChanged();
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={count ? `Notifications, ${count} unread` : 'Notifications'}
        >
          <BellIcon className="size-5" />
          {count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">
              {count > 9 ? '9+' : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b px-4 py-2">
          <span className="text-sm font-semibold">Notifications</span>
          <Button variant="link" size="sm" className="h-auto p-0" onClick={markAll}>
            Mark all read
          </Button>
        </div>
        <ul className="max-h-96 divide-y overflow-y-auto">
          {latest === null && <li className="px-4 py-3 text-sm text-muted-foreground">Loading…</li>}
          {latest?.length === 0 && (
            <li className="px-4 py-3 text-sm text-muted-foreground">You&apos;re all caught up.</li>
          )}
          {latest?.map((n) => (
            <li key={n.notificationId}>
              <button
                type="button"
                onClick={() => openItem(n)}
                className={cn(
                  'flex w-full gap-2 px-4 py-2 text-left text-sm hover:bg-muted/60',
                  !n.read && 'font-medium',
                )}
              >
                <span
                  className={cn(
                    'mt-1.5 size-2 shrink-0 rounded-full',
                    n.read ? 'bg-transparent' : 'bg-primary',
                  )}
                />
                <span>
                  {n.message}
                  <span className="block text-xs font-normal text-muted-foreground">
                    {n.link ? n.groupName : `${n.groupName} · Group deleted`} ·{' '}
                    {timeAgo(n.createdAt)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t px-4 py-2 text-right text-sm">
          <Link
            to="/notifications"
            onClick={() => setOpen(false)}
            className="underline underline-offset-4"
          >
            View all notifications →
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
