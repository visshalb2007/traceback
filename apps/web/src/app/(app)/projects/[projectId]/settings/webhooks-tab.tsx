'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Plus, Trash2, Webhook } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { EmptyState, ErrorState } from '@/components/ui/alert';
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
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { queryKeys, webhooksApi } from '@/lib/api';
import { API_BASE_URL, errorMessage } from '@/lib/api-client';
import { deliveryStatusMeta } from '@/lib/labels';
import { relativeTime } from '@/lib/utils';

function copy(value: string, label: string): void {
  void navigator.clipboard
    .writeText(value)
    .then(() => toast.success(`${label} copied`))
    .catch(() => toast.error('Could not copy'));
}

function CreateEndpointDialog({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [secret, setSecret] = useState('');
  const [events, setEvents] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      webhooksApi.create(projectId, {
        provider: 'github',
        name: name.trim(),
        secret: secret.trim(),
        events: events
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
        active: true,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.webhooks(projectId) });
      toast.success('Webhook endpoint created');
      setOpen(false);
      setName('');
      setSecret('');
      setEvents('');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" />
          Add endpoint
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a GitHub webhook</DialogTitle>
          <DialogDescription>
            The secret must match the one configured in the GitHub webhook settings.
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
            <Label htmlFor="endpoint-name">Name</Label>
            <Input
              id="endpoint-name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="GitHub · payments-api"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="endpoint-secret">Secret</Label>
            <Input
              id="endpoint-secret"
              required
              minLength={16}
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              placeholder="at least 16 characters"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="endpoint-events">Events (optional, comma-separated)</Label>
            <Input
              id="endpoint-events"
              value={events}
              onChange={(event) => setEvents(event.target.value)}
              placeholder="push, deployment_status"
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Creating…' : 'Create endpoint'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function WebhooksTab({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();

  const endpoints = useQuery({
    queryKey: queryKeys.webhooks(projectId),
    queryFn: () => webhooksApi.list(projectId),
  });

  const deliveries = useQuery({
    queryKey: queryKeys.webhookDeliveries(projectId),
    queryFn: () => webhooksApi.deliveries(projectId),
  });

  const remove = useMutation({
    mutationFn: (webhookId: string) => webhooksApi.remove(projectId, webhookId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.webhooks(projectId) });
      toast.success('Endpoint deleted');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <Webhook className="h-4 w-4" />
            Endpoints
          </h3>
          <CreateEndpointDialog projectId={projectId} />
        </div>

        {endpoints.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : endpoints.isError ? (
          <ErrorState
            description={errorMessage(endpoints.error)}
            onRetry={() => void endpoints.refetch()}
          />
        ) : endpoints.data.items.length === 0 ? (
          <EmptyState
            title="No endpoints"
            description="Add a GitHub webhook so pushes and deployments flow in automatically."
          />
        ) : (
          <div className="space-y-3">
            {endpoints.data.items.map((endpoint) => {
              const url = `${API_BASE_URL}/webhooks/github/${endpoint.id}`;
              return (
                <div key={endpoint.id} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{endpoint.name}</span>
                        <Badge variant="outline">{endpoint.provider}</Badge>
                        {endpoint.active ? (
                          <Badge variant="success">active</Badge>
                        ) : (
                          <Badge variant="muted">paused</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        secret · {endpoint.secretPreview}
                        {endpoint.events.length ? ` · ${endpoint.events.join(', ')}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => copy(url, 'Webhook URL')}>
                        <Copy className="h-3.5 w-3.5" />
                        Copy URL
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Delete endpoint"
                        disabled={remove.isPending}
                        onClick={() => remove.mutate(endpoint.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <code className="mt-2 block break-all rounded bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
                    {url}
                  </code>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium">Recent deliveries</h3>
        {deliveries.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : deliveries.isError ? (
          <ErrorState description={errorMessage(deliveries.error)} />
        ) : deliveries.data.items.length === 0 ? (
          <EmptyState title="No deliveries yet" />
        ) : (
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Delivery</TableHead>
                  <TableHead>Received</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deliveries.data.items.map((delivery) => {
                  const meta = deliveryStatusMeta[delivery.status];
                  return (
                    <TableRow key={delivery.id}>
                      <TableCell className="font-mono text-xs">{delivery.event}</TableCell>
                      <TableCell>
                        <Badge variant={meta.tone}>{meta.label}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {delivery.deliveryId.slice(0, 12)}
                      </TableCell>
                      <TableCell className="text-xs" title={delivery.receivedAt}>
                        {relativeTime(delivery.receivedAt)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
