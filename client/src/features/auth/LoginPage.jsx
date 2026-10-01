import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { APP_NAME } from '@splitbook/shared';
import { authApi } from '@/api/endpoints.js';
import { errorMessage } from '@/api/messages.js';
import { useAuth } from '@/auth/AuthProvider.jsx';
import { safeNext } from '@/auth/guards.jsx';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** WIREFRAMES §2.1 — first version for M9; finished in M10 (resend link, rate-limit timer). */
export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(
    params.get('error') === 'google_failed' ? 'Google sign-in failed. Try again.' : '',
  );
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await login(form);
      navigate(safeNext(params.get('next')), { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40">
      <Card className="w-[380px]">
        <CardHeader>
          <div className="text-sm font-semibold">◆ {APP_NAME}</div>
          <h1 className="text-xl leading-none font-semibold">Log in</h1>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit} noValidate>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
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
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Logging in…' : 'Log in'}
            </Button>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
            </div>
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
        </CardContent>
      </Card>
    </div>
  );
}
