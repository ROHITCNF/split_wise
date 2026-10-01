import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { authApi } from '@/api/endpoints.js';
import { errorMessage } from '@/api/messages.js';
import { useAuth } from '@/auth/AuthProvider.jsx';
import { safeNext } from '@/auth/guards.jsx';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthLayout, OrDivider } from './AuthLayout.jsx';

/** WIREFRAMES §2.1 */
export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(
    params.get('error') === 'google_failed'
      ? { message: 'Google sign-in failed. Try again.' }
      : null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [waitSeconds, setWaitSeconds] = useState(0);

  // 429: count down retryAfterSeconds with the button disabled.
  useEffect(() => {
    if (waitSeconds <= 0) return undefined;
    const timer = setTimeout(() => setWaitSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [waitSeconds]);

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login({ email: form.email, password: form.password });
      navigate(safeNext(params.get('next')), { replace: true });
    } catch (err) {
      if (err.code === 'RATE_LIMITED') setWaitSeconds(err.details?.retryAfterSeconds ?? 60);
      setError(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout title="Log in">
      <form className="space-y-4" onSubmit={submit} noValidate>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>
              {error.code === 'RATE_LIMITED'
                ? `Too many attempts. Try again in ${waitSeconds} seconds.`
                : error.code
                  ? errorMessage(error)
                  : error.message}
            </AlertDescription>
          </Alert>
        )}
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </div>
        <Button type="submit" className="w-full" disabled={submitting || waitSeconds > 0}>
          {submitting ? 'Logging in…' : 'Log in'}
        </Button>
        <OrDivider />
        <Button type="button" variant="outline" className="w-full" asChild>
          <a href={authApi.googleStartUrl()}>Continue with Google</a>
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          New here?{' '}
          <Link to="/signup" className="text-foreground underline underline-offset-4">
            Create an account
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
