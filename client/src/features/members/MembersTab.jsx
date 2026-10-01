import { useState } from 'react';
import { toast } from 'sonner';
import { MoreHorizontalIcon, PlusIcon } from 'lucide-react';
import { groupsApi } from '@/api/endpoints.js';
import { errorMessage } from '@/api/messages.js';
import { useAuth } from '@/auth/AuthProvider.jsx';
import { useConfirm } from '@/components/ConfirmProvider.jsx';
import { BalanceText, Money } from '@/components/common.jsx';
import { MemberSearch } from '@/components/MemberSearch.jsx';
import { balanceTone, formatInstantDate, initials } from '@/lib/format.js';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { useGroup } from '../groups/GroupContext.jsx';

/** Balance of another member, from their side: "owed ₹X" / "owes ₹X" / "settled up". */
function OtherBalance({ netPaise }) {
  if (netPaise === 0) return <span className="text-muted-foreground">settled up</span>;
  return (
    <span className={balanceTone(netPaise)}>
      {netPaise > 0 ? 'owed ' : 'owes '}
      <Money paise={Math.abs(netPaise)} />
    </span>
  );
}

/** WIREFRAMES §7.1–7.4 */
export function MembersTab() {
  const { group, refetchGroup } = useGroup();
  const { user } = useAuth();
  const confirm = useConfirm();
  const [addOpen, setAddOpen] = useState(false);
  const isAdmin = group.me.role === 'admin';

  const remove = async (member) => {
    const ok = await confirm({
      title: `Remove ${member.name}?`,
      description: "They'll lose access to this group.",
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (!ok) return;
    try {
      await groupsApi.removeMember(group.groupId, member.membershipId);
      toast.success(`${member.name} removed`);
      refetchGroup();
    } catch (err) {
      if (err.code === 'BALANCE_NOT_ZERO') {
        await confirm({
          title: "Can't remove yet",
          description: (
            <p>
              {member.name.split(' ')[0]}&apos;s balance is{' '}
              <Money paise={Math.abs(err.details.netPaise)} />. It must be ₹0.00 before removal.
            </p>
          ),
          confirmLabel: 'OK',
        });
      } else {
        toast.error(errorMessage(err));
      }
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Members ({group.members.length})</h2>
        {isAdmin && (
          <Button onClick={() => setAddOpen(true)}>
            <PlusIcon className="size-4" /> Add member
          </Button>
        )}
      </div>
      <div className="rounded-md border">
        <Table>
          <TableBody>
            {group.members.map((m) => {
              const mine = m.userId === user.id;
              return (
                <TableRow key={m.membershipId}>
                  <TableCell className="w-10">
                    <Avatar className="size-8">
                      <AvatarFallback className="text-xs">{initials(m.name)}</AvatarFallback>
                    </Avatar>
                  </TableCell>
                  <TableCell className="font-medium">{m.name}</TableCell>
                  <TableCell className="text-muted-foreground">{m.email}</TableCell>
                  <TableCell>
                    <Badge variant={m.role === 'admin' ? 'default' : 'secondary'}>
                      {m.role === 'admin' ? 'Admin' : 'Member'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    Joined {formatInstantDate(m.joinedAt)}
                  </TableCell>
                  <TableCell>
                    {mine ? (
                      <BalanceText netPaise={m.netPaise} />
                    ) : (
                      <OtherBalance netPaise={m.netPaise} />
                    )}
                  </TableCell>
                  <TableCell className="w-10">
                    {isAdmin && !mine && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={`Actions for ${m.name}`}>
                            <MoreHorizontalIcon className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem variant="destructive" onSelect={() => remove(m)}>
                            Remove from group
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {group.pastMembers.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            Past members ({group.pastMembers.length})
          </summary>
          <ul className="mt-2 space-y-1 pl-4">
            {group.pastMembers.map((m) => (
              <li key={m.membershipId} className="text-muted-foreground">
                {m.name} ({m.status}) · {formatInstantDate(m.joinedAt)} –{' '}
                {formatInstantDate(m.endedAt)}
              </li>
            ))}
          </ul>
        </details>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add member</DialogTitle>
          </DialogHeader>
          <MemberSearch
            groupId={group.groupId}
            onPick={async (picked) => {
              try {
                await groupsApi.addMember(group.groupId, picked.userId);
                toast.success(`${picked.name.split(' ')[0]} added`);
                setAddOpen(false);
                refetchGroup();
              } catch (err) {
                toast.error(errorMessage(err));
              }
            }}
          />
          <p className="text-xs text-muted-foreground">Current members are hidden.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
