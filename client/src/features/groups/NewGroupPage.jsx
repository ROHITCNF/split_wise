import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { XIcon } from 'lucide-react';
import { groupsApi } from '@/api/endpoints.js';
import { errorMessage } from '@/api/messages.js';
import { useAuth } from '@/auth/AuthProvider.jsx';
import { PageHeader } from '@/components/common.jsx';
import { MemberSearch } from '@/components/MemberSearch.jsx';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FieldError } from '../auth/AuthLayout.jsx';

/** WIREFRAMES §5.2 (G2) — creator becomes admin; needs at least one other member. */
export function NewGroupPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [members, setMembers] = useState([]);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const create = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const group = await groupsApi.create({
        name,
        description: description || null,
        memberUserIds: members.map((m) => m.userId),
      });
      toast.success('Group created');
      navigate(`/groups/${group.groupId}/expenses`);
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="max-w-2xl space-y-6" onSubmit={create}>
      <PageHeader title="New group" back={{ to: '/groups', label: 'Groups' }} />
      {error && !error.fieldErrors && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage(error)}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-2">
        <Label htmlFor="group-name">Group name *</Label>
        <Input
          id="group-name"
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <FieldError message={error?.fieldErrors?.name} />
          <span className="ml-auto">{name.length}/60</span>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="group-description">Description</Label>
        <Textarea
          id="group-description"
          rows={2}
          value={description}
          maxLength={200}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div className="text-right text-xs text-muted-foreground">{description.length}/200</div>
      </div>
      <div className="space-y-2">
        <Label>Members * (at least 1 besides you)</Label>
        <MemberSearch
          hideUserIds={[user.id, ...members.map((m) => m.userId)]}
          onPick={(picked) => setMembers((list) => [...list, picked])}
        />
        <div className="flex flex-wrap items-center gap-2 pt-2 text-sm">
          Selected:
          <Badge variant="secondary">You · Admin</Badge>
          {members.map((m) => (
            <Badge key={m.userId} variant="outline" className="gap-1">
              {m.name}
              <button
                type="button"
                aria-label={`Remove ${m.name}`}
                onClick={() => setMembers((list) => list.filter((x) => x.userId !== m.userId))}
              >
                <XIcon className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
        {members.length === 0 && (
          <p className="text-xs text-muted-foreground">Add at least one member</p>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => navigate('/groups')}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving || !name.trim() || members.length === 0}>
          Create group
        </Button>
      </div>
    </form>
  );
}
