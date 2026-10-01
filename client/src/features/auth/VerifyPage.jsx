import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { authApi } from '@/api/endpoints.js';
import { useAuth } from '@/auth/AuthProvider.jsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AuthLayout } from './AuthLayout.jsx';

/** WIREFRAMES §2.4 — uses the token once (A2); success logs in (API-3). */
export function VerifyPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const { signedIn } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState(token ? 'verifying' : 'failed');
  const [email, setEmail] = useState('');
  const started = useRef(false);

  useEffect(() => {
    // Tokens are single-use: guard against StrictMode running the effect twice.
    if (!token || started.current) return;
    started.current = true;
    authApi
      .verifyEmail(token)
      .then(({ user }) => {
        setStatus('verified');
        signedIn(user);
        setTimeout(() => navigate('/', { replace: true }), 1200);
      })
      .catch(() => setStatus('failed'));
  }, [token, signedIn, navigate]);

  const resend = async (event) => {
    event.preventDefault();
    await authApi.resendVerification(email.trim()).catch(() => {});
    toast.success('If your account needs verifying, a new link is on its way.');
  };

  return (
    <AuthLayout title="Verify email">
      {status === 'verifying' && (
        <p className="text-sm text-muted-foreground" role="status">
          Verifying…
        </p>
      )}
      {status === 'verified' && (
        <p className="text-sm">✅ Email verified. Taking you to your dashboard…</p>
      )}
      {status === 'failed' && (
        <div className="space-y-4 text-sm">
          <p>❌ This link is invalid or has expired.</p>
          <form className="flex gap-2" onSubmit={resend}>
            <Input
              type="email"
              placeholder="Your email"
              aria-label="Your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button type="submit" variant="outline" disabled={!email.trim()}>
              Resend verification
            </Button>
          </form>
          <Link to="/login" className="underline underline-offset-4">
            Back to login
          </Link>
        </div>
      )}
    </AuthLayout>
  );
}
