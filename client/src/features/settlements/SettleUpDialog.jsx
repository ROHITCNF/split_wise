import { useState } from 'react';
import { toast } from 'sonner';
import { paiseToRupeesString, rupeesToPaise, todayIST } from '@splitbook/shared';
import { balancesApi, settlementsApi } from '@/api/endpoints.js';
import { withConfirmation } from '@/api/confirm.js';
import { errorMessage } from '@/api/messages.js';
import { useRequest } from '@/hooks/useRequest.js';
import { useConfirm } from '@/components/ConfirmProvider.jsx';
import { DateField, Money } from '@/components/common.jsx';
import { formatPaise } from '@/lib/format.js';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FieldError } from '../auth/AuthLayout.jsx';

/**
 * WIREFRAMES §11.1 — record (S2) or edit (S4) a payment made outside the app.
 * `initial` prefills { fromMembershipId, toMembershipId, amountPaise }; `prefill:
 * 'largest-i-owe'` picks the caller's biggest debt (FR-STL-08).
 */
export function SettleUpDialog({
  open,
  onOpenChange,
  group,
  initial,
  settlement,
  prefill,
  onSaved,
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {open && (
          <SettleUpForm
            group={group}
            initial={initial}
            settlement={settlement}
            prefill={prefill}
            onClose={() => onOpenChange(false)}
            onSaved={onSaved}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function SettleUpForm({ group, initial, settlement, prefill, onClose, onSaved }) {
  const confirm = useConfirm();
  const me = group.me.membershipId;
  const { data: balances } = useRequest(
    (opts) => balancesApi.get(group.groupId, opts),
    [group.groupId],
  );
  const [form, setForm] = useState(() => {
    const start = settlement
      ? {
          fromMembershipId: settlement.from.membershipId,
          toMembershipId: settlement.to.membershipId,
          amountPaise: settlement.amountPaise,
        }
      : (initial ?? { fromMembershipId: me, toMembershipId: '', amountPaise: 0 });
    return {
      from: String(start.fromMembershipId ?? ''),
      to: String(start.toMembershipId ?? ''),
      amount: start.amountPaise ? paiseToRupeesString(start.amountPaise) : '',
      date: settlement?.settlementDate ?? todayIST(),
      note: settlement?.note ?? '',
    };
  });
  const [prefilled, setPrefilled] = useState(
    Boolean(initial || settlement || prefill !== 'largest-i-owe'),
  );
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Prefill with the caller's largest debt once balances arrive.
  if (!prefilled && balances) {
    const largest = [...balances.me.youOwe].sort((a, b) => b.amountPaise - a.amountPaise)[0];
    setPrefilled(true);
    if (largest) {
      setForm((f) => ({
        ...f,
        to: String(largest.to.membershipId),
        amount: paiseToRupeesString(largest.amountPaise),
      }));
    }
  }

  const from = Number(form.from);
  const to = Number(form.to);
  const amountPaise = rupeesToPaise(form.amount) ?? 0;
  const pair = balances?.pairs.find(
    (p) => p.from.membershipId === from && p.to.membershipId === to,
  );
  const editingSame =
    settlement && settlement.from.membershipId === from && settlement.to.membershipId === to
      ? settlement.amountPaise
      : 0;
  const owedPaise = (pair?.amountPaise ?? 0) + editingSame;
  const nameOf = (id) =>
    group.members.find((m) => m.membershipId === id)?.name.split(' ')[0] ?? 'They';

  let problem = null;
  if (form.from && form.to && from === to) problem = 'Pick two different people';
  else if (form.from && form.to && from !== me && to !== me) problem = 'One side must be you';

  const save = async () => {
    setBusy(true);
    setError(null);
    const body = {
      fromMembershipId: from,
      toMembershipId: to,
      amountPaise,
      settlementDate: form.date,
      note: form.note,
    };
    try {
      const result = await withConfirmation(
        (confirmed) =>
          settlement
            ? settlementsApi.update(group.groupId, settlement.settlementId, {
                ...body,
                confirm: confirmed,
              })
            : settlementsApi.create(group.groupId, { ...body, confirm: confirmed }),
        (err) =>
          confirm({
            title: "More than what's owed",
            description: (
              <p>
                ⚠ {nameOf(from)} owes {nameOf(to)} <Money paise={err.details.owedPaise} />, but
                you&apos;re recording <Money paise={amountPaise} />. Afterwards {nameOf(to)} will
                owe {nameOf(from)} <Money paise={amountPaise - err.details.owedPaise} />.
              </p>
            ),
            confirmLabel: settlement ? 'Save anyway' : 'Record anyway',
            cancelLabel: 'Go back',
          }),
      );
      if (!result.done) return;
      const other = from === me ? to : from;
      toast.success(
        settlement ? 'Payment updated' : `Payment recorded. ${nameOf(other)} will be notified.`,
      );
      onClose();
      onSaved?.();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: 'Delete this payment?',
      description: 'Balances will go back to what they were before it.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    try {
      await settlementsApi.remove(group.groupId, settlement.settlementId);
      toast.success('Payment deleted');
      onClose();
      onSaved?.();
    } catch (err) {
      setError(err);
    }
  };

  const memberSelect = (id, value, onChange, label) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full" aria-label={label}>
        <SelectValue placeholder="Choose" />
      </SelectTrigger>
      <SelectContent>
        {group.members.map((m) => (
          <SelectItem key={m.membershipId} value={String(m.membershipId)}>
            {m.name}
            {m.membershipId === me ? ' (you)' : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <>
      <DialogHeader>
        <DialogTitle>{settlement ? 'Edit payment' : 'Record a payment'}</DialogTitle>
        <DialogDescription>
          Payments happen outside the app. This only records them.
        </DialogDescription>
      </DialogHeader>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage(error)}</AlertDescription>
        </Alert>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="settle-from">From *</Label>
          {memberSelect('settle-from', form.from, (v) => setForm({ ...form, from: v }), 'From')}
        </div>
        <div className="space-y-2">
          <Label htmlFor="settle-to">To *</Label>
          {memberSelect('settle-to', form.to, (v) => setForm({ ...form, to: v }), 'To')}
        </div>
      </div>
      <FieldError message={problem} />
      <div className="space-y-2">
        <Label htmlFor="settle-amount">Amount (₹) *</Label>
        <div className="flex items-center gap-3">
          <Input
            id="settle-amount"
            className="w-40"
            inputMode="decimal"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
          />
          {form.from && form.to && from !== to && (
            <span className="text-sm text-muted-foreground">
              Currently owed: {formatPaise(owedPaise)}
            </span>
          )}
        </div>
        {amountPaise > owedPaise && owedPaise >= 0 && form.to && (
          <p className="text-xs text-muted-foreground">This is more than what&apos;s owed.</p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="settle-date">Date *</Label>
          <DateField
            id="settle-date"
            value={form.date}
            onChange={(date) => setForm({ ...form, date })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="settle-note">Note</Label>
          <Input
            id="settle-note"
            maxLength={200}
            placeholder="UPI, cash…"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
        </div>
      </div>
      <DialogFooter>
        {settlement && (
          <Button variant="destructive" className="mr-auto" onClick={remove}>
            Delete
          </Button>
        )}
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={save}
          disabled={busy || !form.from || !form.to || problem !== null || amountPaise <= 0}
        >
          {settlement ? 'Save' : 'Record payment'}
        </Button>
      </DialogFooter>
    </>
  );
}
