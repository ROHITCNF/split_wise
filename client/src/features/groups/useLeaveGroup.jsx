import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { groupsApi } from '@/api/endpoints.js';
import { errorMessage } from '@/api/messages.js';
import { useConfirm } from '@/components/ConfirmProvider.jsx';
import { Money } from '@/components/common.jsx';
import { AdminLeaveDialog } from '../members/AdminLeaveDialog.jsx';

/**
 * Leave flow (WIREFRAMES §7.3 / §7.5): members confirm and leave (M3, zero balance
 * only); admins choose "make someone admin, then leave" or "leave and delete".
 */
export function useLeaveGroup(group) {
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [adminOpen, setAdminOpen] = useState(false);

  const leftGroup = (message) => {
    toast.success(message);
    navigate('/groups', { replace: true });
  };

  const startLeave = async () => {
    if (group.me.role === 'admin') return setAdminOpen(true);

    const ok = await confirm({
      title: `Leave ${group.name}?`,
      description: "You'll lose access to this group's expenses.",
      confirmLabel: 'Leave',
    });
    if (!ok) return undefined;
    try {
      await groupsApi.leave(group.groupId, {});
      leftGroup(`You left ${group.name}`);
    } catch (err) {
      if (err.code !== 'BALANCE_NOT_ZERO') return toast.error(errorMessage(err));
      const net = err.details?.netPaise ?? 0;
      const settle = await confirm({
        title: "You can't leave yet",
        description: (
          <p>
            {net < 0 ? 'You owe ' : 'You are owed '}
            <Money paise={Math.abs(net)} /> in this group. Settle up first.
          </p>
        ),
        confirmLabel: 'Settle up',
        cancelLabel: 'Close',
      });
      if (settle) navigate(`/groups/${group.groupId}/balances`);
    }
    return undefined;
  };

  const leaveDialogs = (
    <AdminLeaveDialog
      open={adminOpen}
      onOpenChange={setAdminOpen}
      group={group}
      onLeft={() => leftGroup(`You left ${group.name}`)}
      onDeleted={() => leftGroup(`${group.name} was deleted`)}
    />
  );

  return { startLeave, leaveDialogs };
}
