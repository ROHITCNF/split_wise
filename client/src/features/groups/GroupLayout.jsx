import { Link, NavLink, Outlet } from 'react-router';
import { PlusIcon } from 'lucide-react';
import { BalanceText } from '@/components/common.jsx';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useGroup } from './GroupContext.jsx';

const TABS = [
  ['expenses', 'Expenses'],
  ['balances', 'Balances'],
  ['settlements', 'Settlements'],
  ['activity', 'Activity'],
  ['members', 'Members'],
  ['settings', 'Settings'],
];

/** WIREFRAMES §6 — header, actions and tabs around each group tab. */
export function GroupLayout() {
  const { group } = useGroup();
  const { me } = group;

  return (
    <div>
      <Link to="/groups" className="text-sm text-muted-foreground hover:text-foreground">
        ← Groups
      </Link>
      <div className="mt-2 mb-6 flex items-start justify-between gap-6">
        <div>
          <h1 className="text-2xl font-semibold">{group.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {[
              group.description,
              `${group.members.length} members`,
              me.role === 'admin' ? 'You are admin' : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <BalanceText netPaise={me.netPaise} className="text-sm font-medium" />
          <div className="flex gap-2">
            {me.netPaise < 0 && (
              <Button variant="outline" asChild>
                <Link to={`/groups/${group.groupId}/balances`}>Settle up</Link>
              </Button>
            )}
            <Button asChild>
              <Link to={`/groups/${group.groupId}/expenses/new`}>
                <PlusIcon className="size-4" /> Add expense
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <nav className="mb-6 flex gap-1 border-b" aria-label="Group sections">
        {TABS.map(([path, label]) => (
          <NavLink
            key={path}
            to={`/groups/${group.groupId}/${path}`}
            className={({ isActive }) =>
              cn(
                '-mb-px border-b-2 border-transparent px-4 py-2 text-sm text-muted-foreground hover:text-foreground',
                isActive && 'border-primary text-foreground',
              )
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>

      <Outlet />
    </div>
  );
}
