'use client';

import type { ApiKeyWithSecret, CreateApiKeyInput } from '@traceback/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, KeyRound, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Alert, EmptyState, ErrorState } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
import { apiKeysApi, queryKeys } from '@/lib/api';
import { errorMessage } from '@/lib/api-client';
import { roleMeta } from '@/lib/labels';
import { relativeTime } from '@/lib/utils';

/** Keys may not exceed the creator's own privileges, so a key is never an `owner`. */
type KeyRole = CreateApiKeyInput['role'];
const KEY_ROLES: KeyRole[] = ['maintainer', 'member', 'viewer'];

function CreateKeyDialog({
  projectId,
  onCreated,
}: {
  projectId: string;
  onCreated: (key: ApiKeyWithSecret) => void;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState<KeyRole>('member');

  const mutation = useMutation({
    mutationFn: () => apiKeysApi.create(projectId, { name: name.trim(), role }),
    onSuccess: (key) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys(projectId) });
      onCreated(key);
      setOpen(false);
      setName('');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" />
          New key
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create an API key</DialogTitle>
          <DialogDescription>
            The secret is shown once. The key inherits your identity but is capped at the role you
            choose.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            mutation.mutate();
          }}
          noValidate
        >
          <div className="space-y-1.5">
            <Label htmlFor="key-name">Name</Label>
            <Input
              id="key-name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="CI pipeline"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select
              value={role}
              options={KEY_ROLES.map((value) => ({ value, label: roleMeta[value].label }))}
              onChange={(event) => setRole(event.target.value as KeyRole)}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Creating…' : 'Create key'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ApiKeysTab({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [justCreated, setJustCreated] = useState<ApiKeyWithSecret | null>(null);

  const keys = useQuery({
    queryKey: queryKeys.apiKeys(projectId),
    queryFn: () => apiKeysApi.list(projectId),
  });

  const revoke = useMutation({
    mutationFn: (keyId: string) => apiKeysApi.revoke(projectId, keyId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys(projectId) });
      toast.success('Key revoked');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <div className="space-y-6">
      {justCreated ? (
        <Alert variant="warning" title="Copy this token now — it is shown only once">
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="break-all rounded bg-background/60 px-2 py-1 font-mono text-xs">
              {justCreated.token}
            </code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(justCreated.token);
                toast.success('Token copied');
              }}
            >
              <Copy className="h-3.5 w-3.5" />
              Copy
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setJustCreated(null)}>
              Done
            </Button>
          </div>
        </Alert>
      ) : null}

      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <KeyRound className="h-4 w-4" />
          API keys
        </h3>
        <CreateKeyDialog projectId={projectId} onCreated={setJustCreated} />
      </div>

      {keys.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : keys.isError ? (
        <ErrorState description={errorMessage(keys.error)} onRetry={() => void keys.refetch()} />
      ) : keys.data.items.length === 0 ? (
        <EmptyState
          title="No API keys"
          description="Create a key so CI can post deployments without a user session."
        />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Prefix</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.data.items.map((key) => {
                const revoked = Boolean(key.revokedAt);
                return (
                  <TableRow key={key.id} className={revoked ? 'opacity-50' : undefined}>
                    <TableCell className="font-medium">
                      {key.name}
                      {revoked ? (
                        <Badge variant="muted" className="ml-2">
                          revoked
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{key.prefix}</TableCell>
                    <TableCell>
                      <Badge variant={roleMeta[key.role].tone}>{roleMeta[key.role].label}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {key.lastUsedAt ? relativeTime(key.lastUsedAt) : 'never'}
                    </TableCell>
                    <TableCell className="text-xs">{relativeTime(key.createdAt)}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Revoke ${key.name}`}
                        disabled={revoked || revoke.isPending}
                        onClick={() => revoke.mutate(key.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
