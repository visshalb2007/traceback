'use client';

import {
  INCIDENT_LINK_ENTITY_TYPES,
  type IncidentLink,
  type IncidentLinkEntityType,
} from '@traceback/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GitCommitHorizontal, Link2, Rocket, Sparkles, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { EmptyState, ErrorState } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { changesApi, correlationApi, deploymentsApi, queryKeys } from '@/lib/api';
import { errorMessage } from '@/lib/api-client';
import { linkStatusMeta } from '@/lib/labels';
import { formatPercent, relativeTime, shortSha } from '@/lib/utils';

function entityLabel(
  link: Pick<IncidentLink, 'entityType' | 'entityId'>,
  deployments: Map<string, string>,
  changes: Map<string, string>,
): string {
  if (link.entityType === 'deployment') return deployments.get(link.entityId) ?? link.entityId;
  return changes.get(link.entityId) ?? link.entityId;
}

function LinkRow({
  link,
  label,
  onDecide,
  pending,
}: {
  link: IncidentLink;
  label: string;
  onDecide: (linkId: string, decision: 'confirm' | 'reject') => void;
  pending: boolean;
}) {
  const meta = linkStatusMeta[link.status];
  const Icon = link.entityType === 'deployment' ? Rocket : GitCommitHorizontal;

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{label}</p>
            <p className="text-xs text-muted-foreground">
              {link.entityType} · added {relativeTime(link.createdAt)}
              {link.algorithmVersion ? ` · ${link.algorithmVersion}` : ''}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {link.score !== null ? (
            <Badge variant="outline">{formatPercent(link.score, 0)}</Badge>
          ) : null}
          <Badge variant={meta.tone}>{meta.label}</Badge>
        </div>
      </div>

      {link.score !== null ? (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${Math.round(link.score * 100)}%` }}
          />
        </div>
      ) : null}

      {link.reasons.length ? (
        <ul className="mt-2 space-y-1">
          {link.reasons.map((reason) => (
            <li key={reason} className="flex items-start gap-2 text-xs text-muted-foreground">
              <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
              {reason}
            </li>
          ))}
        </ul>
      ) : null}

      {link.note ? <p className="mt-2 text-xs italic text-muted-foreground">{link.note}</p> : null}

      {link.status === 'suggested' ? (
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => onDecide(link.id, 'confirm')}
          >
            <ThumbsUp className="h-3.5 w-3.5" />
            Confirm
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => onDecide(link.id, 'reject')}
          >
            <ThumbsDown className="h-3.5 w-3.5" />
            Reject
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function CorrelationPanel({
  projectId,
  incidentId,
}: {
  projectId: string;
  incidentId: string;
}) {
  const queryClient = useQueryClient();
  const [entityType, setEntityType] = useState<IncidentLinkEntityType>('deployment');
  const [entityId, setEntityId] = useState('');
  const [note, setNote] = useState('');

  const links = useQuery({
    queryKey: queryKeys.incidentLinks(projectId, incidentId),
    queryFn: () => correlationApi.listLinks(projectId, incidentId),
  });

  const deployments = useQuery({
    queryKey: queryKeys.deployments(projectId, { limit: 50 }),
    queryFn: () => deploymentsApi.list(projectId, { limit: 50 }),
  });

  const changes = useQuery({
    queryKey: queryKeys.changes(projectId, { limit: 50 }),
    queryFn: () => changesApi.list(projectId, { limit: 50 }),
  });

  const deploymentLabels = new Map(
    (deployments.data?.items ?? []).map((deployment) => [
      deployment.id,
      `${deployment.service} · ${deployment.version ?? 'unversioned'} (${deployment.environment})`,
    ]),
  );
  const changeLabels = new Map(
    (changes.data?.items ?? []).map((change) => [
      change.id,
      `${shortSha(change.sha)} ${change.title}`,
    ]),
  );

  const invalidateLinks = (): void => {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.incidentLinks(projectId, incidentId),
    });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.incidentSuggestions(projectId, incidentId),
    });
    void queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
  };

  const run = useMutation({
    mutationFn: () => correlationApi.run(projectId, incidentId),
    onSuccess: (result) => {
      invalidateLinks();
      toast.success(`Correlation complete · ${result.candidates.length} candidate(s)`);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const decide = useMutation({
    mutationFn: ({ linkId, decision }: { linkId: string; decision: 'confirm' | 'reject' }) =>
      correlationApi.decide(projectId, incidentId, linkId, { decision }),
    onSuccess: (link) => {
      invalidateLinks();
      toast.success(link.status === 'confirmed' ? 'Link confirmed' : 'Link rejected');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const addManual = useMutation({
    mutationFn: () =>
      correlationApi.addLink(projectId, incidentId, {
        entityType,
        entityId,
        ...(note.trim() ? { note: note.trim() } : {}),
      }),
    onSuccess: () => {
      invalidateLinks();
      toast.success('Link added');
      setEntityId('');
      setNote('');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (links.isPending) return <Skeleton className="h-64 w-full" />;
  if (links.isError) {
    return (
      <ErrorState description={errorMessage(links.error)} onRetry={() => void links.refetch()} />
    );
  }

  const suggested = links.data.items.filter((link) => link.status === 'suggested');
  const confirmed = links.data.items.filter((link) => link.status === 'confirmed');
  const rejected = links.data.items.filter((link) => link.status === 'rejected');

  const entityOptions =
    entityType === 'deployment'
      ? (deployments.data?.items ?? []).map((deployment) => ({
          value: deployment.id,
          label: `${deployment.service} · ${deployment.version ?? 'unversioned'}`,
        }))
      : (changes.data?.items ?? []).map((change) => ({
          value: change.id,
          label: `${shortSha(change.sha)} ${change.title}`,
        }));

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            Suspected cause
          </CardTitle>
          <CardDescription>
            Ranked deployments and changes, with the signals that produced each score.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => run.mutate()} disabled={run.isPending}>
          {run.isPending ? 'Running…' : 'Re-run correlation'}
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">Suggestions</h3>
          {suggested.length === 0 ? (
            <EmptyState
              title="No open suggestions"
              description="Run the correlation engine to look for suspects near this incident."
            />
          ) : (
            <div className="space-y-3">
              {suggested.map((link) => (
                <LinkRow
                  key={link.id}
                  link={link}
                  label={entityLabel(link, deploymentLabels, changeLabels)}
                  onDecide={(linkId, decision) => decide.mutate({ linkId, decision })}
                  pending={decide.isPending}
                />
              ))}
            </div>
          )}
        </section>

        {confirmed.length || rejected.length ? (
          <section className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">
              Decisions ({confirmed.length} confirmed · {rejected.length} rejected)
            </h3>
            <div className="space-y-3">
              {[...confirmed, ...rejected].map((link) => (
                <LinkRow
                  key={link.id}
                  link={link}
                  label={entityLabel(link, deploymentLabels, changeLabels)}
                  onDecide={(linkId, decision) => decide.mutate({ linkId, decision })}
                  pending={decide.isPending}
                />
              ))}
            </div>
          </section>
        ) : null}

        <section className="space-y-3 border-t pt-4">
          <h3 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Link2 className="h-3.5 w-3.5" />
            Link manually
          </h3>
          <form
            className="grid gap-3 sm:grid-cols-3"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              if (!entityId) return;
              addManual.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select
                value={entityType}
                options={INCIDENT_LINK_ENTITY_TYPES.map((value) => ({ value, label: value }))}
                onChange={(event) => {
                  setEntityType(event.target.value as IncidentLinkEntityType);
                  setEntityId('');
                }}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Entity</Label>
              <Select
                value={entityId}
                options={[{ value: '', label: 'Select…' }, ...entityOptions]}
                onChange={(event) => setEntityId(event.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor="link-note">Note (optional)</Label>
              <Input
                id="link-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Why is this related?"
              />
            </div>
            <div className="sm:col-span-3">
              <Button type="submit" disabled={addManual.isPending || !entityId}>
                {addManual.isPending ? 'Linking…' : 'Add link'}
              </Button>
            </div>
          </form>
        </section>
      </CardContent>
    </Card>
  );
}
