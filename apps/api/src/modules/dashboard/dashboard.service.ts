import type {
  DashboardMetrics,
  DashboardQuery,
  DeploymentStatus,
  IncidentSeverity,
  IncidentStatus,
  SuspectDeployment,
} from '@traceback/shared';
import { DEPLOYMENT_STATUSES, INCIDENT_SEVERITIES, INCIDENT_STATUSES } from '@traceback/shared';
import type { Database } from '../../db/client';
import { toIsoTimestamp } from '../../lib/time';
import { summarizeEvent } from '../timeline/timeline.service';
import {
  createDashboardRepository,
  type DashboardRepository,
  type DeploymentCountRow,
  type RecurringIssueRow,
  type ResolvedIncidentRow,
  type TopSuspectRow,
} from './dashboard.repository';

const DAY_MS = 86_400_000;

export function zeroCounts<K extends string>(keys: readonly K[]): Record<K, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>;
}

/** The [from, to] window a request asked for, always with `to >= from`. */
export function resolveWindow(
  query: DashboardQuery,
  now: Date = new Date(),
): { from: Date; to: Date; days: number } {
  const to = query.to ? new Date(query.to) : now;
  const from = query.from
    ? new Date(query.from)
    : new Date(to.getTime() - query.windowDays * DAY_MS);
  const safeFrom = from.getTime() <= to.getTime() ? from : to;
  const days = Math.max(1, Math.round((to.getTime() - safeFrom.getTime()) / DAY_MS));
  return { from: safeFrom, to, days };
}

/**
 * Mean time to resolution, overall and per severity. Pure: the caller hands over
 * one row per resolved incident and gets back the DTO, so the maths is testable
 * without a database. Severities with no resolutions report `null`, not `0`.
 */
export function summariseMttr(rows: readonly ResolvedIncidentRow[]): DashboardMetrics['mttr'] {
  const totals = zeroCounts(INCIDENT_SEVERITIES);
  const counts = zeroCounts(INCIDENT_SEVERITIES);

  let grandTotal = 0;
  for (const row of rows) {
    totals[row.severity] += row.seconds;
    counts[row.severity] += 1;
    grandTotal += row.seconds;
  }

  const bySeverity = zeroCounts(INCIDENT_SEVERITIES) as Record<IncidentSeverity, number | null>;
  for (const severity of INCIDENT_SEVERITIES) {
    bySeverity[severity] =
      counts[severity] > 0 ? Math.round(totals[severity] / counts[severity]) : null;
  }

  return {
    overallSeconds: rows.length > 0 ? Math.round(grandTotal / rows.length) : null,
    bySeverity,
    resolvedCount: rows.length,
  };
}

export function countIncidents(
  rows: readonly { severity: IncidentSeverity; status: IncidentStatus; count: number }[],
): DashboardMetrics['incidents'] {
  const bySeverity = zeroCounts(INCIDENT_SEVERITIES) as Record<IncidentSeverity, number>;
  const byStatus = zeroCounts(INCIDENT_STATUSES) as Record<IncidentStatus, number>;
  let total = 0;

  for (const row of rows) {
    bySeverity[row.severity] += row.count;
    byStatus[row.status] += row.count;
    total += row.count;
  }

  return { bySeverity, byStatus, total };
}

/**
 * Deployment counts plus a zero-filled daily series. Postgres only returns days
 * that actually had activity, so empty days are inserted here to keep the chart's
 * x-axis continuous.
 */
export function summariseDeployments(
  rows: readonly DeploymentCountRow[],
  window: { from: Date; days: number },
): DashboardMetrics['deployments'] {
  const byStatus = zeroCounts(DEPLOYMENT_STATUSES) as Record<DeploymentStatus, number>;
  const byEnvironment: Record<string, number> = {};
  const daily = new Map<string, number>();
  let totalDeployments = 0;

  for (const row of rows) {
    byStatus[row.status] += row.count;
    byEnvironment[row.environment] = (byEnvironment[row.environment] ?? 0) + row.count;
    daily.set(row.day, (daily.get(row.day) ?? 0) + row.count);
    totalDeployments += row.count;
  }

  const series: Array<{ date: string; count: number }> = [];
  for (let offset = 0; offset < window.days; offset += 1) {
    const date = new Date(window.from.getTime() + offset * DAY_MS).toISOString().slice(0, 10);
    series.push({ date, count: daily.get(date) ?? 0 });
  }

  return {
    totalDeployments,
    perDay: window.days > 0 ? Number((totalDeployments / window.days).toFixed(2)) : 0,
    byEnvironment,
    byStatus,
    daily: series,
  };
}

/** A failed or rolled-back deployment is a change failure. */
export function changeFailureRate(
  byStatus: Partial<Record<DeploymentStatus, number>>,
): DashboardMetrics['changeFailureRate'] {
  const totalDeployments = DEPLOYMENT_STATUSES.reduce(
    (sum, status) => sum + (byStatus[status] ?? 0),
    0,
  );
  const failedDeployments = (byStatus.failed ?? 0) + (byStatus.rolled_back ?? 0);

  return {
    rate: totalDeployments === 0 ? 0 : Number((failedDeployments / totalDeployments).toFixed(4)),
    failedDeployments,
    totalDeployments,
  };
}

export function toRecurringIssue(
  row: RecurringIssueRow,
): DashboardMetrics['recurringIssues'][number] {
  return {
    fingerprint: row.fingerprint,
    title: row.title,
    service: row.service,
    occurrences: row.occurrences,
    avgMttrSeconds: row.avg_mttr_seconds,
    firstSeenAt: toIsoTimestamp(row.first_seen_at),
    lastSeenAt: toIsoTimestamp(row.last_seen_at),
    incidentIds: row.incident_ids,
  };
}

export function toSuspectDeployment(row: TopSuspectRow): SuspectDeployment {
  return {
    deploymentId: row.deployment_id,
    service: row.service,
    environment: row.environment,
    status: row.status,
    version: row.version,
    occurredAt: toIsoTimestamp(row.occurred_at),
    linkedIncidentCount: row.linked_incident_count,
    score: Number(row.score.toFixed(4)),
    reasons: row.reasons ?? [],
  };
}

export interface DashboardService {
  getMetrics(projectId: string, query: DashboardQuery): Promise<DashboardMetrics>;
}

export function createDashboardService(db: Database): DashboardService {
  const repo: DashboardRepository = createDashboardRepository(db);

  return {
    async getMetrics(projectId, query) {
      const window = resolveWindow(query);

      const [incidentRows, resolvedRows, deploymentRows, recurringRows, suspectRows, recentEvents] =
        await Promise.all([
          repo.incidentCounts(projectId, window.from, window.to),
          repo.resolvedIncidents(projectId, window.from, window.to),
          repo.deploymentCounts(projectId, window.from, window.to),
          repo.recurringIssues(projectId, window.from, window.to, 5),
          repo.topSuspects(projectId, window.from, window.to, 5),
          repo.recentEvents(projectId, 10),
        ]);

      const deployments = summariseDeployments(deploymentRows, window);

      return {
        window: {
          from: window.from.toISOString(),
          to: window.to.toISOString(),
          days: window.days,
        },
        incidents: countIncidents(incidentRows),
        mttr: summariseMttr(resolvedRows),
        deployments,
        changeFailureRate: changeFailureRate(deployments.byStatus),
        recurringIssues: recurringRows.map(toRecurringIssue),
        topSuspects: suspectRows.map(toSuspectDeployment),
        recentActivity: recentEvents.map((event) => ({
          id: event.id,
          type: event.type,
          summary: summarizeEvent(event.type, event.payload),
          occurredAt: event.occurredAt.toISOString(),
          isLate: event.isLate,
        })),
      };
    },
  };
}
