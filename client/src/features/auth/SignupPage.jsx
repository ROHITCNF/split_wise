import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { signupBody } from '@splitbook/shared';
import { authApi } from '@/api/endpoints.js';
import { errorMessage } from '@/api/messages.js';
import { useAuth } from '@/auth/AuthProvider.jsx';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthLayout, FieldError, OrDivider } from './AuthLayout.jsx';

/**
 * WIREFRAMES §2.2 — no email verification in the MVP (REQUIREMENTS v1.3):
 * the account is created and the user lands on the dashboard logged in.
 */
export function SignupPage() {
  const { signedIn } = useAuth();
  const navigate = useNavigate();
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
      const { user } = await authApi.signup(values);
      signedIn(user);
      toast.success(`Welcome to SplitBook, ${user.name.split(' ')[0]}!`);
      navigate('/', { replace: true });
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
