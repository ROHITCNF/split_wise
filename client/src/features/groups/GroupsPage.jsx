import { Link, useNavigate } from 'react-router';
import { ChevronRightIcon, PlusIcon } from 'lucide-react';
import { groupsApi } from '@/api/endpoints.js';
import { useRequest } from '@/hooks/useRequest.js';
import {
  BalanceText,
  EmptyState,
  ErrorState,
  LoadingRows,
  PageHeader,
} from '@/components/common.jsx';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/** WIREFRAMES §5.1 (G1). */
export function GroupsPage() {
  const navigate = useNavigate();
  const { data, error, loading, refetch } = useRequest((opts) => groupsApi.list(opts), []);

  return (
    <div>
      <PageHeader
        title="Groups"
        actions={
          <Button asChild>
            <Link to="/groups/new">
              <PlusIcon className="size-4" /> New group
            </Link>
          </Button>
        }
      />
      {error && <ErrorState error={error} onRetry={refetch} />}
      {loading && !data && <LoadingRows />}
      {data?.items.length === 0 && (
        <EmptyState title="You're not in any groups yet.">
          <Button asChild>
            <Link to="/groups/new">Create your first group</Link>
          </Button>
        </EmptyState>
      )}
      {data?.items.length > 0 && (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Members</TableHead>
                <TableHead>My role</TableHead>
                <TableHead>My balance</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((g) => (
                <TableRow
                  key={g.groupId}
                  className="cursor-pointer"
                  onClick={() => navigate(`/groups/${g.groupId}/expenses`)}
                >
                  <TableCell className="font-medium">
                    <Link to={`/groups/${g.groupId}/expenses`}>{g.name}</Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{g.description || '—'}</TableCell>
                  <TableCell>{g.memberCount}</TableCell>
                  <TableCell>{g.myRole === 'admin' ? 'Admin' : 'Member'}</TableCell>
                  <TableCell>
                    <BalanceText netPaise={g.myNetPaise} />
                  </TableCell>
                  <TableCell className="w-8">
                    <ChevronRightIcon className="size-4 text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
