import { and, arrayContains, asc, desc, eq, gt, lt, or, sql } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import type { IncidentSeverity, IncidentStatus } from '@traceback/shared';
import type { DbExecutor } from '../../db/client';
import { incidents } from '../../db/schema';
import type { IncidentRow, NewIncidentRow } from '../../db/schema';

export type IncidentSortKey = 'startedAt' | 'updatedAt' | 'severity' | 'status';
export type SortOrder = 'asc' | 'desc';

export interface IncidentListFilters {
  status?: IncidentStatus | undefined;
  severity?: IncidentSeverity | undefined;
  service?: string | undefined;
  fingerprint?: string | undefined;
  search?: string | undefined;
  sort: IncidentSortKey;
  order: SortOrder;
  limit: number;
  /** Keyset cursor over (sortValue, id). */
  cursorValue?: string | undefined;
  cursorId?: string | undefined;
}

export interface IncidentPatch {
  title?: string;
  description?: string | null;
  severity?: IncidentSeverity;
  service?: string | null;
  errorSignature?: string | null;
  affectedComponents?: string[];
  environment?: string | null;
  fingerprint?: string;
  status?: IncidentStatus;
  resolvedAt?: Date | null;
  resolvedBy?: string | null;
  resolution?: string | null;
  updatedAt: Date;
}

/**
 * Each sort key maps to its column *and* the Postgres type it must be compared as.
 * Casting enum columns keeps the cursor comparison in the enum's native order
 * (sev1 before sev2) instead of alphabetical order, which a plain text compare
 * would silently get wrong.
 */
const SORT_CAST: Record<IncidentSortKey, string> = {
  startedAt: 'timestamptz',
  updatedAt: 'timestamptz',
  severity: 'incident_severity',
  status: 'incident_status',
};

const SORT_COLUMN: Record<IncidentSortKey, PgColumn> = {
  startedAt: incidents.startedAt,
  updatedAt: incidents.updatedAt,
  severity: incidents.severity,
  status: incidents.status,
};

export function createIncidentsRepository(db: DbExecutor) {
  const sortColumn = (sort: IncidentSortKey): PgColumn => SORT_COLUMN[sort];

  return {
    async insert(row: NewIncidentRow): Promise<IncidentRow> {
      const [inserted] = await db.insert(incidents).values(row).returning();
      if (!inserted) throw new Error('failed to insert incident');
      return inserted;
    },

    async findById(projectId: string, id: string): Promise<IncidentRow | undefined> {
      const [row] = await db
        .select()
        .from(incidents)
        .where(and(eq(incidents.projectId, projectId), eq(incidents.id, id)))
        .limit(1);
      return row;
    },

    async list(projectId: string, filters: IncidentListFilters): Promise<IncidentRow[]> {
      const conditions = [eq(incidents.projectId, projectId)];

      if (filters.status) conditions.push(eq(incidents.status, filters.status));
      if (filters.severity) conditions.push(eq(incidents.severity, filters.severity));
      if (filters.service) conditions.push(eq(incidents.service, filters.service));
      if (filters.fingerprint) conditions.push(eq(incidents.fingerprint, filters.fingerprint));
      if (filters.search) {
        const needle = `%${filters.search.toLowerCase()}%`;
        conditions.push(sql`lower(${incidents.title}) like ${needle}`);
      }

      const column = sortColumn(filters.sort);
      const cast = sql.raw(SORT_CAST[filters.sort]);

      if (filters.cursorValue && filters.cursorId) {
        const value = filters.cursorValue;
        const keyset =
          filters.order === 'desc'
            ? or(
                sql`${column} < ${value}::${cast}`,
                and(sql`${column} = ${value}::${cast}`, lt(incidents.id, filters.cursorId)),
              )
            : or(
                sql`${column} > ${value}::${cast}`,
                and(sql`${column} = ${value}::${cast}`, gt(incidents.id, filters.cursorId)),
              );
        if (keyset) conditions.push(keyset);
      }

      const orderBy =
        filters.order === 'desc'
          ? [desc(column), desc(incidents.id)]
          : [asc(column), asc(incidents.id)];

      return db
        .select()
        .from(incidents)
        .where(and(...conditions))
        .orderBy(...orderBy)
        .limit(filters.limit + 1);
    },

    /**
     * Optimistic-concurrency update. The row_version predicate is in the WHERE
     * clause, so a lost update cannot happen even under concurrent writers — a
     * mismatched version simply updates zero rows.
     */
    async update(
      projectId: string,
      id: string,
      patch: IncidentPatch,
      expectedRowVersion: number,
    ): Promise<IncidentRow | undefined> {
      const [row] = await db
        .update(incidents)
        .set({ ...patch, rowVersion: expectedRowVersion + 1 })
        .where(
          and(
            eq(incidents.projectId, projectId),
            eq(incidents.id, id),
            eq(incidents.rowVersion, expectedRowVersion),
          ),
        )
        .returning();
      return row;
    },

    /** Incidents sharing a fingerprint — the raw material for recurrence counts. */
    async listByFingerprint(
      projectId: string,
      fingerprint: string,
      excludeId?: string,
    ): Promise<IncidentRow[]> {
      const conditions = [
        eq(incidents.projectId, projectId),
        eq(incidents.fingerprint, fingerprint),
      ];
      if (excludeId) conditions.push(sql`${incidents.id} <> ${excludeId}`);
      return db
        .select()
        .from(incidents)
        .where(and(...conditions))
        .orderBy(desc(incidents.startedAt));
    },

    /** Any overlap with the affected components — used to widen correlation candidates. */
    async listByComponents(projectId: string, components: string[]): Promise<IncidentRow[]> {
      if (components.length === 0) return [];
      return db
        .select()
        .from(incidents)
        .where(
          and(
            eq(incidents.projectId, projectId),
            arrayContains(incidents.affectedComponents, components),
          ),
        )
        .orderBy(desc(incidents.startedAt))
        .limit(200);
    },
  };
}

export type IncidentsRepository = ReturnType<typeof createIncidentsRepository>;
