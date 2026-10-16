import { and, desc, eq, sql } from 'drizzle-orm';
import type { IncidentLinkEntityType, IncidentLinkStatus } from '@traceback/shared';
import type { DbExecutor } from '../../db/client';
import { incidentLinks, incidents } from '../../db/schema';
import type { IncidentLinkRow, NewIncidentLinkRow } from '../../db/schema';

export interface SuggestionWrite {
  incidentId: string;
  entityType: IncidentLinkEntityType;
  entityId: string;
  score: number;
  reasons: string[];
  signals: Record<string, number>;
  algorithmVersion: string;
}

export interface LinkStatusPatch {
  status: IncidentLinkStatus;
  note?: string | null;
}

/**
 * All reads/writes for `incident_links`. Suggestions and manual links share the
 * table, so this repository is the single place that knows the uniqueness rule
 * (one row per incident+entity) and that a re-run must never clobber a human's
 * confirm/reject decision.
 */
export function createCorrelationRepository(db: DbExecutor) {
  return {
    async listLinks(incidentId: string): Promise<IncidentLinkRow[]> {
      return db
        .select()
        .from(incidentLinks)
        .where(eq(incidentLinks.incidentId, incidentId))
        .orderBy(desc(incidentLinks.score), desc(incidentLinks.createdAt));
    },

    async findLink(incidentId: string, linkId: string): Promise<IncidentLinkRow | undefined> {
      const [row] = await db
        .select()
        .from(incidentLinks)
        .where(and(eq(incidentLinks.incidentId, incidentId), eq(incidentLinks.id, linkId)))
        .limit(1);
      return row;
    },

    async findLinkByEntity(
      incidentId: string,
      entityType: IncidentLinkEntityType,
      entityId: string,
    ): Promise<IncidentLinkRow | undefined> {
      const [row] = await db
        .select()
        .from(incidentLinks)
        .where(
          and(
            eq(incidentLinks.incidentId, incidentId),
            eq(incidentLinks.entityType, entityType),
            eq(incidentLinks.entityId, entityId),
          ),
        )
        .limit(1);
      return row;
    },

    async insertLink(row: NewIncidentLinkRow): Promise<IncidentLinkRow> {
      const [inserted] = await db.insert(incidentLinks).values(row).returning();
      if (!inserted) throw new Error('failed to insert incident link');
      return inserted;
    },

    /**
     * Refreshes a link that is still only a suggestion. The `status = 'suggested'`
     * guard means a confirmed/rejected link keeps its human verdict and score even
     * after the engine runs again.
     */
    async refreshSuggestion(input: SuggestionWrite): Promise<IncidentLinkRow | undefined> {
      const [row] = await db
        .update(incidentLinks)
        .set({
          score: input.score.toFixed(4),
          reasons: input.reasons,
          signals: input.signals,
          algorithmVersion: input.algorithmVersion,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(incidentLinks.incidentId, input.incidentId),
            eq(incidentLinks.entityType, input.entityType),
            eq(incidentLinks.entityId, input.entityId),
            eq(incidentLinks.status, 'suggested'),
          ),
        )
        .returning();
      return row;
    },

    async setLinkStatus(
      incidentId: string,
      linkId: string,
      patch: LinkStatusPatch,
    ): Promise<IncidentLinkRow | undefined> {
      const [row] = await db
        .update(incidentLinks)
        .set({
          status: patch.status,
          ...(patch.note === undefined ? {} : { note: patch.note }),
          updatedAt: new Date(),
        })
        .where(and(eq(incidentLinks.incidentId, incidentId), eq(incidentLinks.id, linkId)))
        .returning();
      return row;
    },

    /**
     * How many *earlier* incidents in this project share the incident's fingerprint
     * and already have a confirmed link. High means "this keeps happening here".
     */
    async countRecurringIncidents(
      projectId: string,
      fingerprint: string,
      excludeIncidentId: string,
    ): Promise<number> {
      const rows = await db.execute<{ count: number }>(sql`
        select count(distinct ${incidentLinks.incidentId})::int as count
        from ${incidentLinks}
        join ${incidents} on ${incidents.id} = ${incidentLinks.incidentId}
        where ${incidents.projectId} = ${projectId}
          and ${incidents.fingerprint} = ${fingerprint}
          and ${incidentLinks.status} = 'confirmed'
          and ${incidentLinks.incidentId} <> ${excludeIncidentId}
      `);
      return Number(rows[0]?.count ?? 0);
    },

    /**
     * How many confirmed links for the same fingerprint pointed at a deployment or
     * change authored by `authorEmail`. This is the "same person, same problem" signal.
     */
    async countAuthorHistory(
      projectId: string,
      fingerprint: string,
      authorEmail: string,
      excludeIncidentId: string,
    ): Promise<number> {
      const rows = await db.execute<{ count: number }>(sql`
        select count(*)::int as count
        from ${incidentLinks} il
        join ${incidents} i on i.id = il.incident_id
        where i.project_id = ${projectId}
          and i.fingerprint = ${fingerprint}
          and il.status = 'confirmed'
          and il.incident_id <> ${excludeIncidentId}
          and (
            (il.entity_type = 'deployment' and exists (
              select 1 from deployments d where d.id = il.entity_id and d.author_email = ${authorEmail}
            ))
            or (il.entity_type = 'change' and exists (
              select 1 from changes c where c.id = il.entity_id and c.author_email = ${authorEmail}
            ))
          )
      `);
      return Number(rows[0]?.count ?? 0);
    },
  };
}

export type CorrelationRepository = ReturnType<typeof createCorrelationRepository>;
