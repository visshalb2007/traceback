'use client';

import {
  INCIDENT_SEVERITIES,
  INCIDENT_STATUS_TRANSITIONS,
  INCIDENT_UPDATE_KINDS,
  type IncidentSeverity,
  type IncidentStatus,
  type IncidentUpdateKind,
} from '@traceback/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, MessageSquarePlus } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/page-header';
import { CorrelationPanel } from '@/components/correlation-panel';
import { EmptyState, ErrorState } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { incidentsApi, queryKeys } from '@/lib/api';
import { ApiError, errorMessage } from '@/lib/api-client';
import { incidentStatusMeta, severityMeta } from '@/lib/labels';
import { relativeTime } from '@/lib/utils';

function StatusPanel({
  projectId,
  incidentId,
  status,
  rowVersion,
}: {
  projectId: string;
  incidentId: string;
  status: IncidentStatus;
  rowVersion: number;
}) {
  const queryClient = useQueryClient();
  const allowed = INCIDENT_STATUS_TRANSITIONS[status];
  const [target, setTarget] = useState<IncidentStatus>(allowed[0] as IncidentStatus);
  const [note, setNote] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      incidentsApi.changeStatus(projectId, incidentId, {
        status: target,
        ...(note.trim() ? { note: note.trim() } : {}),
        expectedRowVersion: rowVersion,
      }),
    onSuccess: (incident) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.incident(projectId, incidentId) });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.incidentUpdates(projectId, incidentId),
      });
      void queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
      toast.success(`Moved to ${incidentStatusMeta[incident.status].label}`);
      setNote('');
    },
    onError: (error) => {
      // A 409 means someone else moved the incident first; surface the diff.
      if (error instanceof ApiError && error.code === 'VERSION_CONFLICT') {
        toast.error('Someone changed this incident first. Reloading the latest state.');
        void queryClient.invalidateQueries({ queryKey: queryKeys.incident(projectId, incidentId) });
      } else {
        toast.error(errorMessage(error));
      }
    },
  });

  if (allowed.length === 0) {
    return <p className="text-sm text-muted-foreground">No further transitions are defined.</p>;
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Move to</span>
        <Select
          aria-label="Target status"
          className="w-44"
          value={target}
          options={allowed.map((value) => ({ value, label: incidentStatusMeta[value].label }))}
          onChange={(event) => setTarget(event.target.value as IncidentStatus)}
        />
      </div>
      <Textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Optional note recorded with the transition…"
      />
      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? 'Applying…' : `Move to ${incidentStatusMeta[target].label}`}
      </Button>
    </form>
  );
}

function EditIncidentDialog({
  projectId,
  incidentId,
  initial,
}: {
  projectId: string;
  incidentId: string;
  initial: {
    title: string;
    description: string | null;
    severity: IncidentSeverity;
    service: string | null;
    environment: string | null;
    rowVersion: number;
  };
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description ?? '');
  const [severity, setSeverity] = useState<IncidentSeverity>(initial.severity);
  const [service, setService] = useState(initial.service ?? '');
  const [environment, setEnvironment] = useState(initial.environment ?? '');

  const mutation = useMutation({
    mutationFn: () =>
      incidentsApi.update(projectId, incidentId, {
        title: title.trim(),
        description: description.trim() || null,
        severity,
        service: service.trim() || null,
        environment: environment.trim() || null,
        expectedRowVersion: initial.rowVersion,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.incident(projectId, incidentId) });
      toast.success('Incident updated');
      setOpen(false);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'VERSION_CONFLICT') {
        toast.error('This incident changed since you opened it. Latest state reloaded.');
        void queryClient.invalidateQueries({ queryKey: queryKeys.incident(projectId, incidentId) });
      } else {
        toast.error(errorMessage(error));
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit incident</DialogTitle>
          <DialogDescription>
            Edits are checked against the version you loaded (rowVersion v{initial.rowVersion}).
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            mutation.mutate();
          }}
          noValidate
        >
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="edit-title">Title</Label>
            <Input
              id="edit-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Severity</Label>
            <Select
              value={severity}
              options={INCIDENT_SEVERITIES.map((value) => ({
                value,
                label: severityMeta[value].label,
              }))}
              onChange={(event) => setSeverity(event.target.value as IncidentSeverity)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-service">Service</Label>
            <Input
              id="edit-service"
              value={service}
              onChange={(event) => setService(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-environment">Environment</Label>
            <Input
              id="edit-environment"
              value={environment}
              onChange={(event) => setEnvironment(event.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="edit-description">Description</Label>
            <Textarea
              id="edit-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UpdatesSection({ projectId, incidentId }: { projectId: string; incidentId: string }) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');
  const [kind, setKind] = useState<IncidentUpdateKind>('comment');

  const updates = useQuery({
    queryKey: queryKeys.incidentUpdates(projectId, incidentId),
    queryFn: () => incidentsApi.listUpdates(projectId, incidentId),
  });

  const mutation = useMutation({
    mutationFn: () => incidentsApi.addComment(projectId, incidentId, { body: body.trim(), kind }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.incidentUpdates(projectId, incidentId),
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.incident(projectId, incidentId) });
      setBody('');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Updates</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {updates.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : updates.isError ? (
          <ErrorState description={errorMessage(updates.error)} />
        ) : updates.data.items.length === 0 ? (
          <EmptyState title="No updates" description="Comments and notes will appear here." />
        ) : (
          <ul className="space-y-3">
            {updates.data.items.map((update) => (
              <li key={update.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{update.authorName ?? 'system'}</span>
                  <div className="flex items-center gap-2">
                    {update.kind !== 'comment' ? (
                      <Badge variant="muted">{update.kind.replace(/_/g, ' ')}</Badge>
                    ) : null}
                    <span className="text-xs text-muted-foreground">
                      {relativeTime(update.occurredAt)}
                    </span>
                  </div>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                  {update.body}
                </p>
              </li>
            ))}
          </ul>
        )}

        <form
          className="space-y-3 border-t pt-4"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            if (!body.trim()) return;
            mutation.mutate();
          }}
        >
          <Textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Add a comment or note…"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Select
              aria-label="Update kind"
              className="w-44"
              value={kind}
              options={INCIDENT_UPDATE_KINDS.map((value) => ({
                value,
                label: value.replace(/_/g, ' '),
              }))}
              onChange={(event) => setKind(event.target.value as IncidentUpdateKind)}
            />
            <Button type="submit" disabled={mutation.isPending || !body.trim()}>
              <MessageSquarePlus className="h-4 w-4" />
              {mutation.isPending ? 'Posting…' : 'Post update'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export default function IncidentDetailPage() {
  const params = useParams<{ projectId: string; incidentId: string }>();
  const { projectId, incidentId } = params;

  const incident = useQuery({
    queryKey: queryKeys.incident(projectId, incidentId),
    queryFn: () => incidentsApi.get(projectId, incidentId),
  });

  if (incident.isPending) return <Skeleton className="h-96 w-full" />;

  if (incident.isError) {
    return (
      <ErrorState
        title="Incident not found"
        description={errorMessage(incident.error)}
        onRetry={() => void incident.refetch()}
      />
    );
  }

  const item = incident.data;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link href={`/projects/${projectId}/incidents`}>
          <ArrowLeft className="h-4 w-4" />
          Incidents
        </Link>
      </Button>

      <PageHeader
        title={item.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant={severityMeta[item.severity].tone}>
              {severityMeta[item.severity].label}
            </Badge>
            <Badge variant={incidentStatusMeta[item.status].tone}>
              {incidentStatusMeta[item.status].label}
            </Badge>
            {item.service ? <span>{item.service}</span> : null}
            {item.environment ? <span>· {item.environment}</span> : null}
          </span>
        }
        actions={
          <EditIncidentDialog
            projectId={projectId}
            incidentId={incidentId}
            initial={{
              title: item.title,
              description: item.description,
              severity: item.severity,
              service: item.service,
              environment: item.environment,
              rowVersion: item.rowVersion,
            }}
          />
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {item.description ? (
              <p className="whitespace-pre-wrap text-sm">{item.description}</p>
            ) : (
              <p className="text-sm text-muted-foreground">No description provided.</p>
            )}
            <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Started</dt>
                <dd>{relativeTime(item.startedAt)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Detected</dt>
                <dd>{item.detectedAt ? relativeTime(item.detectedAt) : '—'}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Resolved</dt>
                <dd>{item.resolvedAt ? relativeTime(item.resolvedAt) : '—'}</dd>
              </div>
              <div className="col-span-2 sm:col-span-3">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  Error signature
                </dt>
                <dd>{item.errorSignature ?? '—'}</dd>
              </div>
              {item.affectedComponents.length ? (
                <div className="col-span-2 sm:col-span-3">
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                    Affected components
                  </dt>
                  <dd className="flex flex-wrap gap-1 pt-1">
                    {item.affectedComponents.map((component) => (
                      <Badge key={component} variant="outline">
                        {component}
                      </Badge>
                    ))}
                  </dd>
                </div>
              ) : null}
              <div className="col-span-2 sm:col-span-3">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  Fingerprint
                </dt>
                <dd className="break-all font-mono text-xs text-muted-foreground">
                  {item.fingerprint}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <StatusPanel
              projectId={projectId}
              incidentId={incidentId}
              status={item.status}
              rowVersion={item.rowVersion}
            />
          </CardContent>
        </Card>
      </div>

      <CorrelationPanel projectId={projectId} incidentId={incidentId} />

      <UpdatesSection projectId={projectId} incidentId={incidentId} />
    </div>
  );
}
