import { createContext, useContext } from 'react';
import { Link, Outlet, useParams } from 'react-router';
import { groupsApi } from '@/api/endpoints.js';
import { useRequest } from '@/hooks/useRequest.js';
import { ErrorState, LoadingRows, useRefetchOnFocus } from '@/components/common.jsx';
import { Button } from '@/components/ui/button';

const GroupContext = createContext(null);

/**
 * Loads the group (G3) once for every screen under /groups/:groupId and shares it.
 * 404 (not a member, or deleted) shows "This group isn't available" (WIREFRAMES §6).
 */
export function GroupLoader() {
  const { groupId } = useParams();
  const { data, error, loading, refetch } = useRequest(
    (opts) => groupsApi.get(groupId, opts),
    [groupId],
  );
  useRefetchOnFocus(refetch);

  if (error?.code === 'NOT_FOUND') {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">This group isn&apos;t available.</h1>
        <Button variant="outline" asChild>
          <Link to="/groups">Back to groups</Link>
        </Button>
      </div>
    );
  }
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (loading && !data) return <LoadingRows rows={6} />;

  return (
    <GroupContext.Provider value={{ group: data, refetchGroup: refetch }}>
      <Outlet />
    </GroupContext.Provider>
  );
}

/** @returns {{ group: object, refetchGroup: () => Promise<void> }} */
export function useGroup() {
  const value = useContext(GroupContext);
  if (!value) throw new Error('useGroup must be used under <GroupLoader>');
  return value;
}
