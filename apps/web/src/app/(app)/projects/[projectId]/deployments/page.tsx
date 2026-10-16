'use client';

import {
  DEPLOYMENT_STATUSES,
  ENVIRONMENTS,
  recordDeploymentSchema,
  type DeploymentStatus,
  type Environment,
} from '@traceback/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Rocket } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/page-header';
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
import { deploymentsApi, queryKeys } from '@/lib/api';
import { errorMessage } from '@/lib/api-client';
import { deploymentStatusMeta, environmentLabels } from '@/lib/labels';
import { formatPercent, relativeTime, shortSha } from '@/lib/utils';

const ENVIRONMENT_OPTIONS = [
  { value: '', label: 'All environments' },
  ...ENVIRONMENTS.map((environment) => ({
    value: environment,
    label: environmentLabels[environment],
  })),
];

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  ...DEPLOYMENT_STATUSES.map((status) => ({
    value: status,
    label: deploymentStatusMeta[status].label,
  })),
];

function RecordDeploymentDialog() {
  const params = useParams<{ projectId: string }>();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [service, setService] = useState('');
  const [environment, setEnvironment] = useState<Environment>('production');
  const [status, setStatus] = useState<DeploymentStatus>('success');
  const [version, setVersion] = useState('');
  const [commitSha, setCommitSha] = useState('');
  const [branch, setBranch] = useState('');
  const [authorEmail, setAuthorEmail] = useState('');
  const [url, setUrl] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      deploymentsApi.record(
        params.projectId,
        recordDeploymentSchema.parse({
          service: service.trim(),
          environment,
          status,
          ...(version.trim() ? { version: version.trim() } : {}),
          ...(commitSha.trim() ? { commitSha: commitSha.trim() } : {}),
          ...(branch.trim() ? { branch: branch.trim() } : {}),
          ...(authorEmail.trim() ? { authorEmail: authorEmail.trim() } : {}),
          ...(url.trim() ? { url: url.trim() } : {}),
        }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['projects', params.projectId] });
      toast.success('Deployment recorded');
      setOpen(false);
      setService('');
      setVersion('');
      setCommitSha('');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" />
          Record deployment
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record a deployment</DialogTitle>
          <DialogDescription>
            Only the service and environment are required; enrich the rest later.
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
            <Label htmlFor="service">Service</Label>
            <Input
              id="service"
              required
              value={service}
              onChange={(event) => setService(event.target.value)}
              placeholder="payments-api"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Environment</Label>
            <Select
              value={environment}
              options={ENVIRONMENTS.map((value) => ({ value, label: environmentLabels[value] }))}
              onChange={(event) => setEnvironment(event.target.value as Environment)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select
              value={status}
              options={DEPLOYMENT_STATUSES.map((value) => ({
                value,
                label: deploymentStatusMeta[value].label,
              }))}
              onChange={(event) => setStatus(event.target.value as DeploymentStatus)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="version">Version</Label>
            <Input
              id="version"
              value={version}
              onChange={(event) => setVersion(event.target.value)}
              placeholder="v1.4.2"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="commit">Commit SHA</Label>
            <Input
              id="commit"
              value={commitSha}
              onChange={(event) => setCommitSha(event.target.value)}
              placeholder="a1b2c3d"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="branch">Branch</Label>
            <Input
              id="branch"
              value={branch}
              onChange={(event) => setBranch(event.target.value)}
              placeholder="main"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="author">Author email</Label>
            <Input
              id="author"
              value={authorEmail}
              onChange={(event) => setAuthorEmail(event.target.value)}
              placeholder="dev@example.com"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="url">URL</Label>
            <Input
              id="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://ci.example.com/runs/123"
            />
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Recording…' : 'Record deployment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function DeploymentsPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const [environment, setEnvironment] = useState<Environment | ''>('');
  const [status, setStatus] = useState<DeploymentStatus | ''>('');

  const filters = {
    environment: environment || undefined,
    status: status || undefined,
    limit: 100,
  };

  const deployments = useQuery({
    queryKey: queryKeys.deployments(projectId, filters),
    queryFn: () => deploymentsApi.list(projectId, filters),
  });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Deployments"
        description="Partial data is welcome; deploy records can be enriched later."
        actions={<RecordDeploymentDialog />}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Select
          aria-label="Environment"
          className="w-44"
          value={environment}
          options={ENVIRONMENT_OPTIONS}
          onChange={(event) => setEnvironment(event.target.value as Environment | '')}
        />
        <Select
          aria-label="Status"
          className="w-40"
          value={status}
          options={STATUS_OPTIONS}
          onChange={(event) => setStatus(event.target.value as DeploymentStatus | '')}
        />
      </div>

      {deployments.isPending ? (
        <Skeleton className="h-72 w-full" />
      ) : deployments.isError ? (
        <ErrorState
          description={errorMessage(deployments.error)}
          onRetry={() => void deployments.refetch()}
        />
      ) : deployments.data.items.length === 0 ? (
        <EmptyState
          title="No deployments"
          description="Record a deployment or wire up the GitHub webhook to populate this list."
        />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Service</TableHead>
                <TableHead>Environment</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Commit</TableHead>
                <TableHead>Author</TableHead>
                <TableHead>When</TableHead>
                <TableHead>Complete</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deployments.data.items.map((deployment) => {
                const meta = deploymentStatusMeta[deployment.status];
                return (
                  <TableRow key={deployment.id}>
                    <TableCell>
                      <Link
                        href={`/projects/${projectId}/deployments/${deployment.id}`}
                        className="flex items-center gap-2 font-medium hover:text-primary"
                      >
                        <Rocket className="h-3.5 w-3.5 text-muted-foreground" />
                        {deployment.service}
                      </Link>
                    </TableCell>
                    <TableCell>{environmentLabels[deployment.environment]}</TableCell>
                    <TableCell>
                      <Badge variant={meta.tone}>{meta.label}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{deployment.version ?? '—'}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {shortSha(deployment.commitSha)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {deployment.authorName ?? deployment.authorEmail ?? '—'}
                    </TableCell>
                    <TableCell className="text-xs" title={deployment.createdAt}>
                      {relativeTime(deployment.createdAt)}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">
                      {formatPercent(deployment.completeness.score, 0)}
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
