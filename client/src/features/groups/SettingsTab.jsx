import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { groupsApi } from '@/api/endpoints.js';
import { errorMessage } from '@/api/messages.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { FieldError } from '../auth/AuthLayout.jsx';
import { DeleteGroupDialog } from './DeleteGroupDialog.jsx';
import { useGroup } from './GroupContext.jsx';
import { useLeaveGroup } from './useLeaveGroup.jsx';

/** WIREFRAMES §6.1 — any member edits details (G4); leave; admin deletes (G5). */
export function SettingsTab() {
  const { group, refetchGroup } = useGroup();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: group.name, description: group.description ?? '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { startLeave, leaveDialogs } = useLeaveGroup(group);
  const changed = form.name !== group.name || form.description !== (group.description ?? '');

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      await groupsApi.update(group.groupId, { name: form.name, description: form.description });
      await refetchGroup();
      toast.success('Group updated');
    } catch (err) {
      setErrors(err.fieldErrors ?? { _: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-8">
      <form className="space-y-4" onSubmit={save}>
        <h2 className="text-lg font-semibold">Group details</h2>
        <div className="space-y-2">
          <Label htmlFor="settings-name">Name</Label>
          <Input
            id="settings-name"
            value={form.name}
            maxLength={60}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <FieldError message={errors.name} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="settings-description">Description</Label>
          <Textarea
            id="settings-description"
            rows={2}
            maxLength={200}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <FieldError message={errors.description ?? errors._} />
        </div>
        <Button type="submit" disabled={saving || !changed || !form.name.trim()}>
          Save changes
        </Button>
      </form>

      <Separator />

      <section className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Leave group</h2>
          <p className="text-sm text-muted-foreground">You can leave when your balance is ₹0.00.</p>
        </div>
        <Button variant="outline" onClick={startLeave}>
          Leave group
        </Button>
      </section>

      {group.me.role === 'admin' && (
        <>
          <Separator />
          <section className="flex items-center justify-between rounded-md border border-destructive/40 p-4">
            <div>
              <h2 className="text-lg font-semibold text-destructive">Danger zone</h2>
              <p className="text-sm text-muted-foreground">
                Delete this group and all its data for everyone.
              </p>
            </div>
            <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
              Delete group
            </Button>
          </section>
        </>
      )}

      <DeleteGroupDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        group={group}
        onConfirm={() => groupsApi.remove(group.groupId, { confirm: true })}
        onDone={() => {
          toast.success(`${group.name} was deleted`);
          navigate('/groups', { replace: true });
        }}
      />
      {leaveDialogs}
    </div>
  );
}
