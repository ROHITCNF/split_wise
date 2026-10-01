import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { profileApi } from '@/api/endpoints.js';
import { errorMessage } from '@/api/messages.js';
import { useAuth } from '@/auth/AuthProvider.jsx';
import { BalanceText, PageHeader, TypeToConfirmDialog } from '@/components/common.jsx';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FieldError } from '../auth/AuthLayout.jsx';

/** WIREFRAMES §3 */
export function ProfilePage() {
  const { user, signedIn, signedOut, logout } = useAuth();
  const navigate = useNavigate();
  const hasPassword = user.loginMethods.includes('password');

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Profile" />
      <AccountCard user={user} onSaved={signedIn} />
      {hasPassword ? (
        <PasswordCard />
      ) : (
        <Card>
          <CardContent className="text-sm text-muted-foreground">
            You sign in with Google. No password set.
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Session</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between text-sm">
          Log out of this device.
          <Button
            variant="outline"
            onClick={async () => {
              await logout();
              navigate('/login', { replace: true });
            }}
          >
            Log out
          </Button>
        </CardContent>
      </Card>
      <DangerZone
        onDeleted={() => {
          signedOut();
          navigate('/login', { replace: true });
          toast.success('Your account was deleted.');
        }}
      />
    </div>
  );
}

function AccountCard({ user, onSaved }) {
  const [name, setName] = useState(user.name);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const { user: updated } = await profileApi.update({ name });
      onSaved(updated);
      toast.success('Name updated');
    } catch (err) {
      setError(err.fieldErrors?.name ?? errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={save}>
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <div className="flex gap-2">
              <Input
                id="name"
                value={name}
                maxLength={60}
                onChange={(e) => setName(e.target.value)}
              />
              <Button type="submit" disabled={saving || !name.trim() || name.trim() === user.name}>
                Save
              </Button>
            </div>
            <FieldError message={error} />
          </div>
          <div className="text-sm">
            <span className="text-muted-foreground">Email</span> {user.email}{' '}
            <span className="text-xs text-muted-foreground">(cannot be changed)</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Sign-in methods</span>
            {user.loginMethods.map((m) => (
              <Badge key={m} variant="secondary">
                {m === 'google' ? 'Google' : 'Password'}
              </Badge>
            ))}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function PasswordCard() {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      await profileApi.changePassword(form);
      setForm({ currentPassword: '', newPassword: '' });
      toast.success('Password changed');
    } catch (err) {
      setErrors(err.fieldErrors ?? { _: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change password</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid max-w-md gap-4" onSubmit={save}>
          <div className="space-y-2">
            <Label htmlFor="current-password">Current password</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={form.currentPassword}
              onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
            />
            <FieldError message={errors.currentPassword} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={form.newPassword}
              onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
            />
            {errors.newPassword ? (
              <FieldError message="Use 8–128 characters" />
            ) : (
              <p className="text-xs text-muted-foreground">8–128 characters</p>
            )}
          </div>
          <FieldError message={errors._} />
          <div>
            <Button
              type="submit"
              disabled={saving || !form.currentPassword || form.newPassword.length < 8}
            >
              Change password
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function DangerZone({ onDeleted }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(null);

  const remove = async () => {
    setBusy(true);
    try {
      await profileApi.deleteAccount();
      setOpen(false);
      onDeleted();
    } catch (err) {
      setOpen(false);
      if (err.code === 'BALANCE_NOT_ZERO' || err.code === 'ADMIN_MUST_CHOOSE') setBlocked(err);
      else toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-destructive">Danger zone</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-between text-sm">
        Delete account. This cannot be undone.
        <Button variant="destructive" onClick={() => setOpen(true)}>
          Delete account
        </Button>
      </CardContent>

      <TypeToConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete your account?"
        description={
          <p>You will leave all groups. Your name stays on past expenses. This cannot be undone.</p>
        }
        phrase="DELETE"
        confirmLabel="Delete"
        busy={busy}
        onConfirm={remove}
      />

      <Dialog open={blocked !== null} onOpenChange={(o) => !o && setBlocked(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>You can&apos;t delete your account yet</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            {blocked?.code === 'BALANCE_NOT_ZERO'
              ? 'Settle these balances first:'
              : 'You are admin of these groups. Make someone else admin or delete the group first:'}
          </p>
          <ul className="divide-y rounded-md border text-sm">
            {blocked?.details?.groups?.map((g) => (
              <li key={g.groupId} className="flex items-center justify-between px-3 py-2">
                <span>{g.groupName}</span>
                <span className="flex items-center gap-3">
                  {g.netPaise !== undefined && <BalanceText netPaise={g.netPaise} />}
                  <Button size="sm" variant="outline" asChild>
                    <Link
                      to={`/groups/${g.groupId}/${blocked.code === 'BALANCE_NOT_ZERO' ? 'balances' : 'settings'}`}
                    >
                      Open
                    </Link>
                  </Button>
                </span>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBlocked(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
