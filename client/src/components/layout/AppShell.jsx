import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { BellIcon, ChevronDownIcon } from 'lucide-react';
import { APP_NAME } from '@splitbook/shared';
import { notificationsApi } from '@/api/endpoints.js';
import { useAuth } from '@/auth/AuthProvider.jsx';
import { usePoller } from '@/hooks/usePoller.js';
import { initials } from '@/lib/format.js';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/groups', label: 'Groups' },
  { to: '/reports', label: 'Reports' },
];

const POLL_MS = 60_000;

/** Unread badge: polled every 60 s while visible and on every navigation (ADR-008). */
export function NotificationBell() {
  const [count, setCount] = useState(0);
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

  const label = count > 9 ? '9+' : String(count);
  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative"
      aria-label={count ? `Notifications, ${count} unread` : 'Notifications'}
      onClick={() => navigate('/notifications')}
    >
      <BellIcon className="size-5" />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">
          {label}
        </span>
      )}
    </Button>
  );
}

function ProfileMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-2 px-2">
          <Avatar className="size-7">
            <AvatarFallback className="text-xs">{initials(user.name)}</AvatarFallback>
          </Avatar>
          <span className="text-sm">{user.name.split(' ')[0]}</span>
          <ChevronDownIcon className="size-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="text-sm font-medium">{user.name}</div>
          <div className="truncate text-xs text-muted-foreground">{user.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/profile')}>Profile</DropdownMenuItem>
        <DropdownMenuItem
          onSelect={async () => {
            await logout();
            navigate('/login', { replace: true });
          }}
        >
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Top bar + centred content, max-width 1200 px (WIREFRAMES §1). */
export function AppShell() {
  return (
    <div className="min-h-screen">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-8 px-6">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <span className="text-primary">◆</span> {APP_NAME}
          </Link>
          <nav className="flex gap-6 text-sm">
            {NAV.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'py-4 text-muted-foreground hover:text-foreground',
                    isActive && 'border-b-2 border-primary text-foreground',
                  )
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <NotificationBell />
            <ProfileMenu />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1200px] px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
