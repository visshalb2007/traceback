'use client';

import {
  INCIDENT_SEVERITIES,
  INCIDENT_STATUSES,
  createIncidentSchema,
  type IncidentSeverity,
  type IncidentStatus,
} from '@traceback/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Repeat } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/page-header';
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
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { incidentsApi, queryKeys } from '@/lib/api';
import { errorMessage } from '@/lib/api-client';
import { incidentStatusMeta, severityMeta } from '@/lib/labels';
import { relativeTime } from '@/lib/utils';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  ...INCIDENT_STATUSES.map((status) => ({
    value: status,
    label: incidentStatusMeta[status].label,
  })),
];

const SEVERITY_OPTIONS = [
  { value: '', label: 'All severities' },
  ...INCIDENT_SEVERITIES.map((severity) => ({
    value: severity,
    label: severityMeta[severity].label,
  })),
];

function toLocalInputValue(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function CreateIncidentDialog() {
  const params = useParams<{ projectId: string }>();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<IncidentSeverity>('sev3');
  const [service, setService] = useState('');
  const [errorSignature, setErrorSignature] = useState('');
  const [environment, setEnvironment] = useState('');
  const [components, setComponents] = useState('');
  const [startedAt, setStartedAt] = useState(() => toLocalInputValue(new Date()));

  const mutation = useMutation({
    mutationFn: () =>
      incidentsApi.create(
        params.projectId,
        createIncidentSchema.parse({
          title: title.trim(),
          severity,
          ...(description.trim() ? { description: description.trim() } : {}),
          ...(service.trim() ? { service: service.trim() } : {}),
          ...(errorSignature.trim() ? { errorSignature: errorSignature.trim() } : {}),
          ...(environment.trim() ? { environment: environment.trim() } : {}),
          affectedComponents: components
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean),
          startedAt: new Date(startedAt).toISOString(),
        }),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['projects', params.projectId] });
      toast.success('Incident opened');
      setOpen(false);
      setTitle('');
      setDescription('');
      setErrorSignature('');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" />
          Open incident
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Open an incident</DialogTitle>
          <DialogDescription>
            The title, service and error signature form a fingerprint used to spot repeats.
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
            <Label htmlFor="incident-title">Title</Label>
            <Input
              id="incident-title"
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Checkout latency spike"
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
            <Label htmlFor="incident-service">Service</Label>
            <Input
              id="incident-service"
              value={service}
              onChange={(event) => setService(event.target.value)}
              placeholder="payments-api"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="incident-environment">Environment</Label>
            <Input
              id="incident-environment"
              value={environment}
              onChange={(event) => setEnvironment(event.target.value)}
              placeholder="production"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="incident-started">Started at</Label>
            <Input
              id="incident-started"
              type="datetime-local"
              value={startedAt}
              onChange={(event) => setStartedAt(event.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="incident-signature">Error signature</Label>
            <Input
              id="incident-signature"
              value={errorSignature}
              onChange={(event) => setErrorSignature(event.target.value)}
              placeholder="HTTP 504 from /checkout"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="incident-components">Affected components</Label>
            <Input
              id="incident-components"
              value={components}
              onChange={(event) => setComponents(event.target.value)}
              placeholder="checkout, payments-db"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="incident-description">Description</Label>
            <Textarea
              id="incident-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Opening…' : 'Open incident'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RecurringIssues({ projectId }: { projectId: string }) {
  const recurring = useQuery({
    queryKey: queryKeys.recurring(projectId),
    queryFn: () => incidentsApi.listRecurring(projectId),
  });

  if (recurring.isPending || recurring.isError) return null;
  if (recurring.data.items.length === 0) return null;

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Repeat className="h-4 w-4 text-primary" />
          Recurring issues
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {recurring.data.items.map((group) => (
          <Link
            key={group.fingerprint}
            href={`/projects/${projectId}/incidents?fingerprint=${group.fingerprint}`}
            className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm transition-colors hover:border-primary/40"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{group.title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {group.service ?? 'unscoped'} · first {relativeTime(group.firstSeenAt)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge variant={severityMeta[group.severity].tone}>
                {severityMeta[group.severity].label}
              </Badge>
              <Badge variant="warning">×{group.count}</Badge>
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

export default function IncidentsPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const [status, setStatus] = useState<IncidentStatus | ''>('');
  const [severity, setSeverity] = useState<IncidentSeverity | ''>('');
  const [search, setSearch] = useState('');

  const filters = {
    status: status || undefined,
    severity: severity || undefined,
    search: search.trim() || undefined,
    limit: 100,
  };

  const incidents = useQuery({
    queryKey: queryKeys.incidents(projectId, filters),
    queryFn: () => incidentsApi.list(projectId, filters),
  });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Incidents"
        description="Status is a state machine, not a free-form field."
        actions={<CreateIncidentDialog />}
      />

      <RecurringIssues projectId={projectId} />

      <div className="mb-4 flex flex-wrap gap-2">
        <Input
          aria-label="Search incidents"
          className="w-56"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search title…"
        />
        <Select
          aria-label="Status"
          className="w-44"
          value={status}
          options={STATUS_OPTIONS}
          onChange={(event) => setStatus(event.target.value as IncidentStatus | '')}
        />
        <Select
          aria-label="Severity"
          className="w-40"
          value={severity}
          options={SEVERITY_OPTIONS}
          onChange={(event) => setSeverity(event.target.value as IncidentSeverity | '')}
        />
      </div>

      {incidents.isPending ? (
        <Skeleton className="h-72 w-full" />
      ) : incidents.isError ? (
        <ErrorState
          description={errorMessage(incidents.error)}
          onRetry={() => void incidents.refetch()}
        />
      ) : incidents.data.items.length === 0 ? (
        <EmptyState
          title="No incidents"
          description="Either everything is fine, or nothing has been reported yet."
        />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Incident</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {incidents.data.items.map((incident) => (
                <TableRow key={incident.id}>
                  <TableCell>
                    <Link
                      href={`/projects/${projectId}/incidents/${incident.id}`}
                      className="font-medium hover:text-primary"
                    >
                      {incident.title}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant={severityMeta[incident.severity].tone}>
                      {severityMeta[incident.severity].label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={incidentStatusMeta[incident.status].tone}>
                      {incidentStatusMeta[incident.status].label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{incident.service ?? '—'}</TableCell>
                  <TableCell className="text-xs">{relativeTime(incident.startedAt)}</TableCell>
                  <TableCell className="text-xs">{relativeTime(incident.updatedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
