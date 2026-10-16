'use client';

import { INCIDENT_SEVERITIES } from '@traceback/shared';
import { useQuery } from '@tanstack/react-query';
import { Activity, Clock, GitCommitHorizontal, Siren, TrendingUp } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { dashboardApi, queryKeys } from '@/lib/api';
import { errorMessage } from '@/lib/api-client';
import { humanizeEventType, severityMeta } from '@/lib/labels';
import { formatDuration, formatNumber, formatPercent, relativeTime } from '@/lib/utils';

const SEVERITY_FILL: Record<string, string> = {
  sev1: 'hsl(var(--sev1))',
  sev2: 'hsl(var(--sev2))',
  sev3: 'hsl(var(--sev3))',
  sev4: 'hsl(var(--sev4))',
};

const WINDOW_OPTIONS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
];

function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Siren;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const [windowDays, setWindowDays] = useState(30);

  const dashboard = useQuery({
    queryKey: queryKeys.dashboard(projectId, windowDays),
    queryFn: () => dashboardApi.get(projectId, windowDays),
  });

  if (dashboard.isPending) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-28 w-full" />
          ))}
        </div>
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (dashboard.isError) {
    return (
      <ErrorState
        title="Could not load the dashboard"
        description={errorMessage(dashboard.error)}
        onRetry={() => void dashboard.refetch()}
      />
    );
  }

  const metrics = dashboard.data;
  const severityData = INCIDENT_SEVERITIES.map((severity) => ({
    severity: severityMeta[severity].label,
    key: severity,
    count: metrics.incidents.bySeverity[severity] ?? 0,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={`Reliability signals across the last ${metrics.window.days} days.`}
        actions={
          <Select
            aria-label="Time window"
            className="w-40"
            value={String(windowDays)}
            options={WINDOW_OPTIONS}
            onChange={(event) => setWindowDays(Number(event.target.value))}
          />
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon={Siren}
          label="Incidents"
          value={formatNumber(metrics.incidents.total)}
          hint={`${metrics.incidents.byStatus.open ?? 0} currently open`}
        />
        <MetricCard
          icon={Clock}
          label="MTTR"
          value={formatDuration(metrics.mttr.overallSeconds)}
          hint={`${metrics.mttr.resolvedCount} resolved`}
        />
        <MetricCard
          icon={GitCommitHorizontal}
          label="Deployments / day"
          value={metrics.deployments.perDay.toFixed(1)}
          hint={`${formatNumber(metrics.deployments.totalDeployments)} total`}
        />
        <MetricCard
          icon={TrendingUp}
          label="Change failure rate"
          value={formatPercent(metrics.changeFailureRate.rate)}
          hint={`${metrics.changeFailureRate.failedDeployments} failed deploys`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Deployments over time</CardTitle>
            <CardDescription>Every recorded deployment per day.</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            {metrics.deployments.daily.length === 0 ? (
              <div className="grid h-full place-items-center text-sm text-muted-foreground">
                No deployments in this window.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={metrics.deployments.daily}>
                  <defs>
                    <linearGradient id="deployments" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                    vertical={false}
                  />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      background: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="hsl(var(--primary))"
                    fill="url(#deployments)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Incidents by severity</CardTitle>
            <CardDescription>How bad things got.</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={severityData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="severity" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
                <Tooltip
                  cursor={{ fill: 'hsl(var(--muted) / 0.4)' }}
                  contentStyle={{
                    background: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {severityData.map((entry) => (
                    <Cell key={entry.key} fill={SEVERITY_FILL[entry.key]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Top suspects</CardTitle>
            <CardDescription>Deployments most often linked to incidents.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {metrics.topSuspects.length === 0 ? (
              <p className="text-sm text-muted-foreground">No suspicious deployments yet.</p>
            ) : (
              metrics.topSuspects.map((suspect) => (
                <div key={suspect.deploymentId} className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{suspect.service}</span>
                    <Badge variant="outline">{formatPercent(suspect.score, 0)}</Badge>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {suspect.version ?? 'unversioned'} · {suspect.environment} ·{' '}
                    {suspect.linkedIncidentCount} linked
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recurring issues</CardTitle>
            <CardDescription>Fingerprints seen more than once.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {metrics.recurringIssues.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing is repeating.</p>
            ) : (
              metrics.recurringIssues.map((issue) => (
                <div key={issue.fingerprint} className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{issue.title}</span>
                    <Badge variant="warning">×{issue.occurrences}</Badge>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {issue.service ?? 'unscoped'} · last {relativeTime(issue.lastSeenAt)}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>The latest events on the stream.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {metrics.recentActivity.length === 0 ? (
              <EmptyState title="No activity yet" />
            ) : (
              metrics.recentActivity.map((item) => (
                <div key={item.id} className="flex items-start gap-2">
                  <Activity className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">
                      {humanizeEventType(item.type)}
                      {item.isLate ? (
                        <Badge variant="warning" className="ml-2 align-middle">
                          late
                        </Badge>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">{relativeTime(item.occurredAt)}</p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
