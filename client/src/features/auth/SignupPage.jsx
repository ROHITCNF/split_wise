import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { signupBody } from '@splitbook/shared';
import { authApi, devApi } from '@/api/endpoints.js';
import { errorMessage } from '@/api/messages.js';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthLayout, FieldError, OrDivider } from './AuthLayout.jsx';

/** WIREFRAMES §2.2 then §2.3 once the server accepts the signup. */
export function SignupPage() {
  const [sentTo, setSentTo] = useState(null);
  return sentTo ? <CheckEmail email={sentTo} /> : <SignupForm onSent={setSentTo} />;
}

function SignupForm({ onSent }) {
  const [serverError, setServerError] = useState(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(signupBody), mode: 'onTouched' });

  const onSubmit = async (values) => {
    setServerError(null);
    try {
      await authApi.signup(values);
      onSent(values.email);
    } catch (err) {
      if (err.code === 'EMAIL_ALREADY_REGISTERED') {
        setError('email', { message: 'An account with this email already exists.' });
      } else if (err.fieldErrors) {
        for (const [field, message] of Object.entries(err.fieldErrors))
          setError(field, { message });
      } else {
        setServerError(err);
      }
    }
  };

  return (
    <AuthLayout title="Create your account">
      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        {serverError && (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage(serverError)}</AlertDescription>
          </Alert>
        )}
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" autoComplete="name" aria-invalid={!!errors.name} {...register('name')} />
          <FieldError message={errors.name?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            aria-invalid={!!errors.email}
            {...register('email')}
          />
          <FieldError message={errors.email?.message} />
          {errors.email?.message?.startsWith('An account') && (
            <Link to="/login" className="text-xs underline underline-offset-4">
              Log in instead
            </Link>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.password}
            {...register('password')}
          />
          {errors.password ? (
            <FieldError message="Use 8–128 characters" />
          ) : (
            <p className="text-xs text-muted-foreground">8–128 characters</p>
          )}
        </div>
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Creating…' : 'Create account'}
        </Button>
        <OrDivider />
        <Button type="button" variant="outline" className="w-full" asChild>
          <a href={authApi.googleStartUrl()}>Continue with Google</a>
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Have an account?{' '}
          <Link to="/login" className="text-foreground underline underline-offset-4">
            Log in
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}

/** §2.3 — resend is disabled for 60 s; dev builds can show the link from the outbox (X1). */
export function CheckEmail({ email }) {
  const [cooldown, setCooldown] = useState(0);
  const [devLink, setDevLink] = useState(null);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const resend = async () => {
    await authApi.resendVerification(email).catch(() => {});
    setCooldown(60);
  };

  const showDevLink = async () => {
    const { items } = await devApi.outbox();
    const link = items.find((item) => item.to === email)?.link;
    setDevLink(link ? new URL(link).pathname + new URL(link).search : 'none');
  };

  return (
    <AuthLayout title="Check your email">
      <div className="space-y-4 text-sm">
        <p>
          We sent a verification link to <span className="font-medium">{email}</span>. The link is
          valid for 24 hours.
        </p>
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={resend} disabled={cooldown > 0}>
            {cooldown > 0 ? `Resend link (${cooldown}s)` : 'Resend link'}
          </Button>
          <Link to="/login" className="underline underline-offset-4">
            Back to login
          </Link>
        </div>
        {import.meta.env.DEV && (
          <div className="rounded-md border border-dashed p-3">
            <p className="text-xs font-semibold text-muted-foreground">DEV ONLY</p>
            {devLink && devLink !== 'none' ? (
              <Link to={devLink} className="break-all underline underline-offset-4">
                Open verification link
              </Link>
            ) : (
              <Button variant="link" className="h-auto p-0" onClick={showDevLink}>
                {devLink === 'none' ? 'No link found — try again' : 'Show link from dev outbox →'}
              </Button>
            )}
          </div>
        )}
      </div>
    </AuthLayout>
  );
}
