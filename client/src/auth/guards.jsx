import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router';
import { useAuth } from './AuthProvider.jsx';

function FullPageLoading() {
  return (
    <div
      className="flex min-h-screen items-center justify-center text-sm text-muted-foreground"
      role="status"
    >
      Loading…
    </div>
  );
}

/** Pages that need a session. Anonymous users go to /login?next=<current path>. */
export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <FullPageLoading />;
  if (status === 'anonymous') {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return <Outlet />;
}

/** Only allow same-site paths as redirect targets (no open redirect via ?next=). */
export function safeNext(next) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

/** Log in / sign up: already-logged-in users are sent on to `next` or the dashboard. */
export function GuestOnly() {
  const { status } = useAuth();
  const [params] = useSearchParams();
  if (status === 'loading') return <FullPageLoading />;
  if (status === 'authenticated') return <Navigate to={safeNext(params.get('next'))} replace />;
  return <Outlet />;
}
