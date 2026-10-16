'use client';

import { EVENT_SOURCES, type EventSource, type TimelineItem } from '@traceback/shared';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CircleDot,
  GitCommitHorizontal,
  RefreshCw,
  Rocket,
  Siren,
  Users,
  Webhook,
  WifiOff,
  type LucideIcon,
} from 'lucide-react';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useProjectStream } from '@/hooks/use-project-stream';
import { queryKeys, timelineApi } from '@/lib/api';
import { errorMessage } from '@/lib/api-client';
import { humanizeEventType } from '@/lib/labels';
import { relativeTime, cn } from '@/lib/utils';

function iconFor(type: string): LucideIcon {
  if (type.startsWith('incident')) return Siren;
  if (type.startsWith('deployment')) return Rocket;
  if (type.startsWith('change')) return GitCommitHorizontal;
  if (type.startsWith('member')) return Users;
  if (type.startsWith('correlation') || type.startsWith('fingerprint')) return AlertTriangle;
  return CircleDot;
}

const SOURCE_OPTIONS = [
  { value: '', label: 'All sources' },
  ...EVENT_SOURCES.map((source) => ({ value: source, label: source })),
];

function StatusPill({ status }: { status: string }) {
  const live = status === 'open';
  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
      <span className="relative flex h-2 w-2">
        {live ? (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
        ) : null}
        <span
          className={cn(
            'relative inline-flex h-2 w-2 rounded-full',
            live ? 'bg-emerald-500' : status === 'error' ? 'bg-amber-500' : 'bg-muted-foreground',
          )}
        />
      </span>
      {live
        ? 'Live'
        : status === 'connecting'
          ? 'Connecting…'
          : status === 'error'
            ? 'Reconnecting…'
            : 'Offline'}
    </span>
  );
}

function TimelineRow({ item }: { item: TimelineItem }) {
  const Icon = iconFor(item.type);
  return (
    <li className="relative flex gap-3 py-3">
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border bg-card">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{humanizeEventType(item.type)}</span>
          {item.isLate ? <Badge variant="warning">late</Badge> : null}
          {item.source !== 'api' ? (
            <Badge variant="muted">
              <Webhook className="h-3 w-3" />
              {item.source}
            </Badge>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">{item.summary}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>{item.actorName ?? 'system'}</span>
          <span title={item.occurredAt}>{relativeTime(item.occurredAt)}</span>
          {item.isLate ? <span title={item.receivedAt}>received late</span> : null}
        </div>
      </div>
    </li>
  );
}

export default function TimelinePage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;

  const [source, setSource] = useState<EventSource | ''>('');
  const [lateOnly, setLateOnly] = useState(false);
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [live, setLive] = useState<TimelineItem[]>([]);

  const filters = useMemo(
    () => ({ source: source || undefined, isLate: lateOnly || undefined, order, limit: 100 }),
    [source, lateOnly, order],
  );

  const timeline = useQuery({
    queryKey: queryKeys.timeline(projectId, filters),
    queryFn: () => timelineApi.list(projectId, filters),
  });

  const status = useProjectStream(projectId, (item) => {
    setLive((previous) =>
      previous.some((existing) => existing.id === item.id)
        ? previous
        : [item, ...previous].slice(0, 50),
    );
  });

  const items = useMemo(() => {
    const seen = new Set<string>();
    const merged: TimelineItem[] = [];
    for (const item of [...live, ...(timeline.data?.items ?? [])]) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      merged.push(item);
    }
    if (order === 'asc') merged.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    return merged;
  }, [live, timeline.data, order]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Timeline"
        description="Ordered by when things happened, with late arrivals flagged."
        actions={
          <div className="flex items-center gap-2">
            <StatusPill status={status} />
            <Button
              variant="outline"
              size="sm"
              onClick={() => void timeline.refetch()}
              disabled={timeline.isFetching}
            >
              <RefreshCw className={cn('h-4 w-4', timeline.isFetching && 'animate-spin')} />
              Refresh
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select
          aria-label="Filter by source"
          className="w-40"
          value={source}
          options={SOURCE_OPTIONS}
          onChange={(event) => setSource(event.target.value as EventSource | '')}
        />
        <Button
          variant={lateOnly ? 'default' : 'outline'}
          size="sm"
          onClick={() => setLateOnly((value) => !value)}
        >
          Late only
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOrder((value) => (value === 'desc' ? 'asc' : 'desc'))}
        >
          {order === 'desc' ? 'Newest first' : 'Oldest first'}
        </Button>
      </div>

      {timeline.isPending ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
      ) : timeline.isError ? (
        <ErrorState
          description={errorMessage(timeline.error)}
          onRetry={() => void timeline.refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="No events yet"
          description="Record a deployment, change or incident and it will appear here in real time."
        />
      ) : (
        <ul className="divide-y rounded-xl border bg-card px-4">
          {items.map((item) => (
            <TimelineRow key={item.id} item={item} />
          ))}
        </ul>
      )}

      {status === 'error' ? (
        <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <WifiOff className="h-3.5 w-3.5" />
          Live updates are reconnecting; the list still refreshes on demand.
        </p>
      ) : null}
    </div>
  );
}
