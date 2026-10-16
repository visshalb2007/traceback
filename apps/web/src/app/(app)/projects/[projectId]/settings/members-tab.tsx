'use client';

import { PROJECT_ROLES, type ProjectRole } from '@traceback/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2, UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/components/auth-provider';
import { EmptyState, ErrorState } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { membersApi, queryKeys } from '@/lib/api';
import { errorMessage } from '@/lib/api-client';
import { roleMeta } from '@/lib/labels';

export function MembersTab({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<ProjectRole>('member');

  const members = useQuery({
    queryKey: queryKeys.members(projectId),
    queryFn: () => membersApi.list(projectId),
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.members(projectId) });
  };

  const invite = useMutation({
    mutationFn: () => membersApi.invite(projectId, { email: email.trim(), role }),
    onSuccess: (member) => {
      invalidate();
      toast.success(`Invited ${member.email}`);
      setEmail('');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const changeRole = useMutation({
    mutationFn: ({ userId, nextRole }: { userId: string; nextRole: ProjectRole }) =>
      membersApi.updateRole(projectId, userId, nextRole),
    onSuccess: () => {
      invalidate();
      toast.success('Role updated');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: (userId: string) => membersApi.remove(projectId, userId),
    onSuccess: () => {
      invalidate();
      toast.success('Member removed');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <div className="space-y-6">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          invite.mutate();
        }}
      >
        <div className="min-w-56 flex-1 space-y-1.5">
          <Label htmlFor="invite-email">Invite by email</Label>
          <Input
            id="invite-email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="teammate@example.com"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Role</Label>
          <Select
            className="w-40"
            value={role}
            options={PROJECT_ROLES.map((value) => ({ value, label: roleMeta[value].label }))}
            onChange={(event) => setRole(event.target.value as ProjectRole)}
          />
        </div>
        <Button type="submit" disabled={invite.isPending}>
          <UserPlus className="h-4 w-4" />
          {invite.isPending ? 'Inviting…' : 'Invite'}
        </Button>
      </form>

      {members.isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : members.isError ? (
        <ErrorState
          description={errorMessage(members.error)}
          onRetry={() => void members.refetch()}
        />
      ) : members.data.items.length === 0 ? (
        <EmptyState title="No members" />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.data.items.map((member) => (
                <TableRow key={member.id}>
                  <TableCell className="font-medium">
                    {member.name}
                    {member.userId === user?.id ? (
                      <Badge variant="muted" className="ml-2">
                        you
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{member.email}</TableCell>
                  <TableCell>
                    <Select
                      aria-label={`Role for ${member.email}`}
                      className="w-40"
                      value={member.role}
                      options={PROJECT_ROLES.map((value) => ({
                        value,
                        label: roleMeta[value].label,
                      }))}
                      onChange={(event) =>
                        changeRole.mutate({
                          userId: member.userId,
                          nextRole: event.target.value as ProjectRole,
                        })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${member.email}`}
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(member.userId)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
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
