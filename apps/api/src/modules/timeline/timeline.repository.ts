import { and, asc, desc, eq, gt, gte, inArray, lt, lte, or, sql } from 'drizzle-orm';
import type { EventEntityType, EventSource, EventType } from '@traceback/shared';
import type { DbExecutor } from '../../db/client';
import { events, users } from '../../db/schema';
import type { EventRow } from '../../db/schema';

export interface TimelineRow {
  event: EventRow;
  actorName: string | null;
}

export interface TimelineFilters {
  types?: EventType[] | undefined;
  entityType?: EventEntityType | undefined;
  entityId?: string | undefined;
  actorId?: string | undefined;
  environment?: string | undefined;
  source?: EventSource | undefined;
  isLate?: boolean | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
  order: 'asc' | 'desc';
  limit: number;
  /** Keyset cursor over (occurred_at, sequence). */
  cursorOccurredAt?: string | undefined;
  cursorSequence?: string | undefined;
}

export function createTimelineRepository(db: DbExecutor) {
  return {
    /**
     * Timeline ordering is by `occurred_at` (when the thing really happened) with
     * `sequence` breaking ties. That is what lets a late event, discovered ten
     * minutes after the fact, slot into the correct historical position instead of
     * appearing at the top.
     */
    async list(projectId: string, filters: TimelineFilters): Promise<TimelineRow[]> {
      const conditions = [eq(events.projectId, projectId)];

      if (filters.types && filters.types.length > 0) {
        conditions.push(inArray(events.type, filters.types));
      }
      if (filters.entityType) conditions.push(eq(events.entityType, filters.entityType));
      if (filters.entityId) conditions.push(eq(events.entityId, filters.entityId));
      if (filters.actorId) conditions.push(eq(events.actorId, filters.actorId));
      if (filters.source) conditions.push(eq(events.source, filters.source));
      if (filters.isLate !== undefined) conditions.push(eq(events.isLate, filters.isLate));
      if (filters.from) conditions.push(gte(events.occurredAt, filters.from));
      if (filters.to) conditions.push(lte(events.occurredAt, filters.to));
      if (filters.environment) {
        conditions.push(sql`${events.payload}->>'environment' = ${filters.environment}`);
      }

      if (filters.cursorOccurredAt && filters.cursorSequence) {
        const cursorDate = new Date(filters.cursorOccurredAt);
        const cursorSeq = Number(filters.cursorSequence);
        const keyset =
          filters.order === 'desc'
            ? or(
                lt(events.occurredAt, cursorDate),
                and(eq(events.occurredAt, cursorDate), lt(events.sequence, cursorSeq)),
              )
            : or(
                gt(events.occurredAt, cursorDate),
                and(eq(events.occurredAt, cursorDate), gt(events.sequence, cursorSeq)),
              );
        if (keyset) conditions.push(keyset);
      }

      const orderBy =
        filters.order === 'desc'
          ? [desc(events.occurredAt), desc(events.sequence)]
          : [asc(events.occurredAt), asc(events.sequence)];

      const rows = await db
        .select({ event: events, actorName: users.name })
        .from(events)
        .leftJoin(users, eq(users.id, events.actorId))
        .where(and(...conditions))
        .orderBy(...orderBy)
        .limit(filters.limit + 1);

      return rows;
    },
  };
}

export type TimelineRepository = ReturnType<typeof createTimelineRepository>;
