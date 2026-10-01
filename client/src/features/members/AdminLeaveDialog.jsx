import { useState } from 'react';
import { groupsApi } from '@/api/endpoints.js';
import { errorMessage } from '@/api/messages.js';
import { BalanceText } from '@/components/common.jsx';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DeleteGroupDialog } from '../groups/DeleteGroupDialog.jsx';

/** WIREFRAMES §7.5 — FR-GRP-16..19. */
export function AdminLeaveDialog({ open, onOpenChange, group, onLeft, onDeleted }) {
  const [mode, setMode] = useState('transfer');
  const [newAdmin, setNewAdmin] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const candidates = group.members.filter((m) => m.membershipId !== group.me.membershipId);
  const balanceBlocks = group.me.netPaise !== 0;

  const proceed = async () => {
    setError(null);
    if (mode === 'delete') {
      onOpenChange(false);
      setDeleteOpen(true);
      return;
    }
    setBusy(true);
    try {
      await groupsApi.leave(group.groupId, {
        mode: 'transfer',
        newAdminMembershipId: Number(newAdmin),
      });
      onOpenChange(false);
      onLeft();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>You&apos;re the admin of {group.name}</DialogTitle>
            <DialogDescription>Choose what happens when you leave:</DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage(error)}</AlertDescription>
            </Alert>
          )}
          <RadioGroup value={mode} onValueChange={setMode} className="gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="transfer" id="leave-transfer" />
                <Label htmlFor="leave-transfer">Make someone else admin, then leave</Label>
              </div>
              {mode === 'transfer' && (
                <div className="space-y-2 pl-6 text-sm">
                  {candidates.length === 0 ? (
                    <p className="text-muted-foreground">
                      There is no one else in the group to make admin.
                    </p>
                  ) : (
                    <Select value={newAdmin} onValueChange={setNewAdmin}>
                      <SelectTrigger className="w-64" aria-label="New admin">
                        <SelectValue placeholder="Choose new admin" />
                      </SelectTrigger>
                      <SelectContent>
                        {candidates.map((m) => (
                          <SelectItem key={m.membershipId} value={String(m.membershipId)}>
                            {m.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <p className="text-muted-foreground">
                    Your balance must be ₹0.00. (Now: <BalanceText netPaise={group.me.netPaise} />
                    {balanceBlocks && ' ⚠'})
                  </p>
                </div>
              )}
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="delete" id="leave-delete" />
                <Label htmlFor="leave-delete">Leave and delete the group</Label>
              </div>
              <p className="pl-6 text-sm text-muted-foreground">
                Deletes ALL expenses, settlements and history for everyone.
              </p>
            </div>
          </RadioGroup>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={proceed}
              disabled={busy || (mode === 'transfer' && (!newAdmin || balanceBlocks))}
              variant={mode === 'delete' ? 'destructive' : 'default'}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DeleteGroupDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        group={group}
        onConfirm={() => groupsApi.leave(group.groupId, { mode: 'delete', confirm: true })}
        onDone={onDeleted}
      />
    </>
  );
}
