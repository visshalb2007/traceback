'use client';

import {
  DEPLOYMENT_STATUSES,
  type DeploymentStatus,
  type EnrichDeploymentInput,
} from '@traceback/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, ExternalLink, Minus } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { changesApi, deploymentsApi, queryKeys } from '@/lib/api';
import { errorMessage } from '@/lib/api-client';
import { deploymentStatusMeta, environmentLabels } from '@/lib/labels';
import { formatPercent, relativeTime, shortSha } from '@/lib/utils';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function CompletenessFlag({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      {ok ? (
        <Check className="h-3.5 w-3.5 text-emerald-500" />
      ) : (
        <Minus className="h-3.5 w-3.5 text-muted-foreground" />
      )}
      <span className={ok ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
    </span>
  );
}

function EnrichForm({ projectId, deploymentId }: { projectId: string; deploymentId: string }) {
  const queryClient = useQueryClient();
  const deployment = useQuery({
    queryKey: queryKeys.deployment(projectId, deploymentId),
    queryFn: () => deploymentsApi.get(projectId, deploymentId),
  });

  const [status, setStatus] = useState<DeploymentStatus | ''>('');
  const [version, setVersion] = useState('');
  const [commitSha, setCommitSha] = useState('');
  const [commitMessage, setCommitMessage] = useState('');

  const mutation = useMutation({
    mutationFn: () => {
      const patch: EnrichDeploymentInput = {
        ...(status ? { status } : {}),
        ...(version.trim() ? { version: version.trim() } : {}),
        ...(commitSha.trim() ? { commitSha: commitSha.trim() } : {}),
        ...(commitMessage.trim() ? { commitMessage: commitMessage.trim() } : {}),
        ...(deployment.data ? { rowVersion: deployment.data.rowVersion } : {}),
      };
      return deploymentsApi.enrich(projectId, deploymentId, patch);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.deployment(projectId, deploymentId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.deployments(projectId, { limit: 100 }),
      });
      toast.success('Deployment enriched');
      setVersion('');
      setCommitSha('');
      setCommitMessage('');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Enrich</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            mutation.mutate();
          }}
          noValidate
        >
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select
              value={status}
              options={[
                { value: '', label: 'Leave unchanged' },
                ...DEPLOYMENT_STATUSES.map((value) => ({
                  value,
                  label: deploymentStatusMeta[value].label,
                })),
              ]}
              onChange={(event) => setStatus(event.target.value as DeploymentStatus | '')}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="enrich-version">Version</Label>
            <Input
              id="enrich-version"
              value={version}
              onChange={(event) => setVersion(event.target.value)}
              placeholder="v1.4.2"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="enrich-sha">Commit SHA</Label>
            <Input
              id="enrich-sha"
              value={commitSha}
              onChange={(event) => setCommitSha(event.target.value)}
              placeholder="a1b2c3d"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="enrich-message">Commit message</Label>
            <Textarea
              id="enrich-message"
              value={commitMessage}
              onChange={(event) => setCommitMessage(event.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : 'Save enrichment'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export default function DeploymentDetailPage() {
  const params = useParams<{ projectId: string; deploymentId: string }>();
  const { projectId, deploymentId } = params;

  const deployment = useQuery({
    queryKey: queryKeys.deployment(projectId, deploymentId),
    queryFn: () => deploymentsApi.get(projectId, deploymentId),
  });

  const changes = useQuery({
    queryKey: queryKeys.changes(projectId, { deploymentId }),
    queryFn: () => changesApi.list(projectId, { deploymentId }),
  });

  if (deployment.isPending) {
    return <Skeleton className="h-72 w-full" />;
  }

  if (deployment.isError) {
    return (
      <ErrorState
        title="Deployment not found"
        description={errorMessage(deployment.error)}
        onRetry={() => void deployment.refetch()}
      />
    );
  }

  const item = deployment.data;
  const meta = deploymentStatusMeta[item.status];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link href={`/projects/${projectId}/deployments`}>
          <ArrowLeft className="h-4 w-4" />
          Deployments
        </Link>
      </Button>

      <PageHeader
        title={item.service}
        description={`${environmentLabels[item.environment]} · ${item.version ?? 'unversioned'}`}
        actions={<Badge variant={meta.tone}>{meta.label}</Badge>}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Field label="Commit">{shortSha(item.commitSha)}</Field>
              <Field label="Branch">{item.branch ?? '—'}</Field>
              <Field label="Author">{item.authorName ?? item.authorEmail ?? '—'}</Field>
              <Field label="Started">{item.startedAt ? relativeTime(item.startedAt) : '—'}</Field>
              <Field label="Finished">
                {item.finishedAt ? relativeTime(item.finishedAt) : 'still unknown'}
              </Field>
              <Field label="Recorded">{relativeTime(item.createdAt)}</Field>
              <Field label="External ID">{item.externalId ?? '—'}</Field>
              <Field label="Row version">v{item.rowVersion}</Field>
              <Field label="Link">
                {item.url ? (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    Open <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  '—'
                )}
              </Field>
              {item.commitMessage ? (
                <div className="col-span-2 space-y-1 sm:col-span-3">
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                    Commit message
                  </dt>
                  <dd className="whitespace-pre-wrap text-sm">{item.commitMessage}</dd>
                </div>
              ) : null}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Completeness</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-2xl font-semibold tabular-nums">
              {formatPercent(item.completeness.score, 0)}
            </p>
            <div className="flex flex-col gap-2">
              <CompletenessFlag ok={item.completeness.hasCommit} label="Commit known" />
              <CompletenessFlag ok={item.completeness.hasAuthor} label="Author known" />
              <CompletenessFlag ok={item.completeness.hasFinishedAt} label="Finished at known" />
              <CompletenessFlag ok={item.completeness.isTerminal} label="Terminal status" />
            </div>
          </CardContent>
        </Card>
      </div>

      <EnrichForm projectId={projectId} deploymentId={deploymentId} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Linked changes</CardTitle>
        </CardHeader>
        <CardContent>
          {changes.isPending ? (
            <Skeleton className="h-24 w-full" />
          ) : changes.isError ? (
            <ErrorState description={errorMessage(changes.error)} />
          ) : changes.data.items.length === 0 ? (
            <EmptyState
              title="No changes linked"
              description="No commits reference this deployment."
            />
          ) : (
            <ul className="divide-y">
              {changes.data.items.map((change) => (
                <li key={change.id} className="flex items-start gap-3 py-3">
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                    {shortSha(change.sha)}
                  </code>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{change.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {change.authorName ?? change.authorEmail ?? 'unknown author'}
                      {change.services.length ? ` · ${change.services.join(', ')}` : ''}
                    </p>
                  </div>
                  <Badge variant="muted">{change.type}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
