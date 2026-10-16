import { desc, eq, sql } from 'drizzle-orm';
import type { DeploymentStatus, IncidentSeverity, IncidentStatus } from '@traceback/shared';
import type { DbExecutor } from '../../db/client';
import { deployments, events, incidentLinks, incidents } from '../../db/schema';
import type { EventRow } from '../../db/schema';

export type IncidentCountRow = {
  severity: IncidentSeverity;
  status: IncidentStatus;
  count: number;
};

export type ResolvedIncidentRow = {
  severity: IncidentSeverity;
  seconds: number;
};

export type DeploymentCountRow = {
  environment: string;
  status: DeploymentStatus;
  day: string;
  count: number;
};

export type RecurringIssueRow = {
  fingerprint: string;
  title: string;
  service: string | null;
  occurrences: number;
  avg_mttr_seconds: number | null;
  first_seen_at: Date;
  last_seen_at: Date;
  incident_ids: string[];
};

export type TopSuspectRow = {
  deployment_id: string;
  service: string;
  environment: string;
  status: DeploymentStatus;
  version: string | null;
  occurred_at: Date;
  linked_incident_count: number;
  score: number;
  reasons: string[] | null;
};

/**
 * Read-only aggregation queries powering the dashboard. Everything is grouped and
 * counted in Postgres — pulling raw rows into Node just to count them would not
 * survive a real project's history. The service layer turns these rows into the
 * `DashboardMetrics` DTO (and fills the gaps Postgres cannot, like empty days).
 */
export function createDashboardRepository(db: DbExecutor) {
  return {
    async incidentCounts(projectId: string, from: Date, to: Date): Promise<IncidentCountRow[]> {
      return [
        ...(await db.execute<IncidentCountRow>(sql`
          select severity, status, count(*)::int as count
          from ${incidents}
          where ${incidents.projectId} = ${projectId}
            and ${incidents.startedAt} between ${from} and ${to}
          group by severity, status
        `)),
      ];
    },

    async resolvedIncidents(
      projectId: string,
      from: Date,
      to: Date,
    ): Promise<ResolvedIncidentRow[]> {
      return [
        ...(await db.execute<ResolvedIncidentRow>(sql`
          select severity,
                 extract(epoch from (${incidents.resolvedAt} - ${incidents.startedAt}))::int as seconds
          from ${incidents}
          where ${incidents.projectId} = ${projectId}
            and ${incidents.resolvedAt} is not null
            and ${incidents.resolvedAt} between ${from} and ${to}
        `)),
      ];
    },

    async deploymentCounts(projectId: string, from: Date, to: Date): Promise<DeploymentCountRow[]> {
      return [
        ...(await db.execute<DeploymentCountRow>(sql`
          select ${deployments.environment} as environment,
                 ${deployments.status} as status,
                 to_char(coalesce(${deployments.finishedAt}, ${deployments.startedAt}, ${deployments.createdAt}), 'YYYY-MM-DD') as day,
                 count(*)::int as count
          from ${deployments}
          where ${deployments.projectId} = ${projectId}
            and coalesce(${deployments.finishedAt}, ${deployments.startedAt}, ${deployments.createdAt}) between ${from} and ${to}
          group by environment, status, day
        `)),
      ];
    },

    async recurringIssues(
      projectId: string,
      from: Date,
      to: Date,
      limit: number,
    ): Promise<RecurringIssueRow[]> {
      return [
        ...(await db.execute<RecurringIssueRow>(sql`
          select
            ${incidents.fingerprint} as fingerprint,
            (array_agg(${incidents.title} order by ${incidents.startedAt} desc))[1] as title,
            (array_agg(${incidents.service} order by ${incidents.startedAt} desc))[1] as service,
            count(*)::int as occurrences,
            avg(case when ${incidents.resolvedAt} is not null
                     then extract(epoch from (${incidents.resolvedAt} - ${incidents.startedAt})) end)::int as avg_mttr_seconds,
            min(${incidents.startedAt}) as first_seen_at,
            max(${incidents.startedAt}) as last_seen_at,
            array_agg(${incidents.id} order by ${incidents.startedAt} desc) as incident_ids
          from ${incidents}
          where ${incidents.projectId} = ${projectId}
            and ${incidents.startedAt} between ${from} and ${to}
          group by ${incidents.fingerprint}
          having count(*) >= 2
          order by count(*) desc, max(${incidents.startedAt}) desc
          limit ${limit}
        `)),
      ];
    },

    /**
     * Deployments ranked by how many incidents they have been linked to (engine
     * suggestions and human confirmations both count) and by best score. This is
     * the "who broke the build" leaderboard.
     */
    async topSuspects(
      projectId: string,
      from: Date,
      to: Date,
      limit: number,
    ): Promise<TopSuspectRow[]> {
      return [
        ...(await db.execute<TopSuspectRow>(sql`
          select
            ${deployments.id} as deployment_id,
            ${deployments.service} as service,
            ${deployments.environment} as environment,
            ${deployments.status} as status,
            ${deployments.version} as version,
            coalesce(${deployments.finishedAt}, ${deployments.startedAt}, ${deployments.createdAt}) as occurred_at,
            count(distinct ${incidentLinks.incidentId})::int as linked_incident_count,
            coalesce(avg(${incidentLinks.score}), 0)::float as score,
            (array_agg(${incidentLinks.reasons} order by ${incidentLinks.score} desc nulls last))[1] as reasons
          from ${deployments}
          left join ${incidentLinks}
            on ${incidentLinks.entityType} = 'deployment'
           and ${incidentLinks.entityId} = ${deployments.id}
          where ${deployments.projectId} = ${projectId}
            and coalesce(${deployments.finishedAt}, ${deployments.startedAt}, ${deployments.createdAt}) between ${from} and ${to}
          group by ${deployments.id}
          having count(${incidentLinks.id}) > 0
          order by score desc, linked_incident_count desc, occurred_at desc
          limit ${limit}
        `)),
      ];
    },

    async recentEvents(projectId: string, limit: number): Promise<EventRow[]> {
      return db
        .select()
        .from(events)
        .where(eq(events.projectId, projectId))
        .orderBy(desc(events.occurredAt), desc(events.sequence))
        .limit(limit);
    },
  };
}

export type DashboardRepository = ReturnType<typeof createDashboardRepository>;
