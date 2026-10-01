import { useState } from 'react';
import { toast } from 'sonner';
import { balancesApi } from '@/api/endpoints.js';
import { errorMessage } from '@/api/messages.js';
import { useRequest } from '@/hooks/useRequest.js';
import { Money, TypeToConfirmDialog } from '@/components/common.jsx';

/**
 * Deleting a group (G5 or admin leave-and-delete) — always typed confirmation (UI-2),
 * listing any open balances first (WIREFRAMES §7.5, E17).
 */
export function DeleteGroupDialog({ open, onOpenChange, group, onConfirm, onDone }) {
  const [busy, setBusy] = useState(false);
  const { data } = useRequest(
    (opts) => balancesApi.get(group.groupId, opts),
    [group.groupId, open],
    {
      enabled: open,
    },
  );

  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
      onOpenChange(false);
      onDone();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <TypeToConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Delete ${group.name} for everyone?`}
      description={
        <>
          {data?.pairs.length > 0 && (
            <div>
              <p className="font-medium text-foreground">⚠ These balances are still open:</p>
              <ul className="mt-1 list-inside list-disc">
                {data.pairs.map((p) => (
                  <li key={`${p.from.membershipId}-${p.to.membershipId}`}>
                    {p.from.name} owes {p.to.name} <Money paise={p.amountPaise} />
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p>
            All expenses, payments and history will be permanently deleted. Members will be
            notified.
          </p>
        </>
      }
      phrase={group.name}
      confirmLabel="Delete group"
      busy={busy}
      onConfirm={confirm}
    />
  );
}
