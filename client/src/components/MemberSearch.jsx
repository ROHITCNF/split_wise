import { useState } from 'react';
import { PlusIcon, SearchIcon } from 'lucide-react';
import { usersApi } from '@/api/endpoints.js';
import { useRequest } from '@/hooks/useRequest.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDebounced } from './common.jsx';

/**
 * Search verified users by name (U1) and pick one (WIREFRAMES §5.2, §7.2).
 * `hideUserIds` hides people already picked; with `groupId` the server also hides
 * current members.
 */
export function MemberSearch({ groupId, hideUserIds = [], onPick, pickLabel = 'Add' }) {
  const [query, setQuery] = useState('');
  const q = useDebounced(query.trim());
  const enabled = q.length >= 2;
  const { data, loading, error } = useRequest(
    (opts) => usersApi.search({ q, groupId }, opts),
    [q, groupId],
    { enabled },
  );
  const results = (data?.items ?? []).filter((u) => !hideUserIds.includes(u.userId));

  return (
    <div className="space-y-2">
      <div className="relative">
        <SearchIcon className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search people by name…"
          aria-label="Search people by name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {query.trim().length > 0 && !enabled && (
        <p className="text-xs text-muted-foreground">Type at least 2 letters</p>
      )}
      {enabled && !loading && !error && results.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No registered user found. They need to sign up and verify their email first.
        </p>
      )}
      {enabled && results.length > 0 && (
        <ul className="divide-y rounded-md border">
          {results.map((user) => (
            <li key={user.userId} className="flex items-center justify-between px-3 py-2 text-sm">
              <span>
                {user.name} <span className="text-muted-foreground">{user.email}</span>
              </span>
              <Button type="button" size="sm" variant="outline" onClick={() => onPick(user)}>
                <PlusIcon className="size-4" /> {pickLabel}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
