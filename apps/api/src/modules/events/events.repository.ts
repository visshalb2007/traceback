import { and, asc, desc, eq, gt } from 'drizzle-orm';
import type { EventEntityType } from '@traceback/shared';
import type { DbExecutor } from '../../db/client';
import { events } from '../../db/schema';
import type { EventRow, NewEventRow } from '../../db/schema';

export function createEventsRepository(db: DbExecutor) {
  return {
    async insert(row: NewEventRow): Promise<EventRow> {
      const [inserted] = await db.insert(events).values(row).returning();
      if (!inserted) throw new Error('failed to insert event');
      return inserted;
    },

    async findByIdempotencyKey(
      projectId: string,
      idempotencyKey: string,
    ): Promise<EventRow | undefined> {
      const [row] = await db
        .select()
        .from(events)
        .where(and(eq(events.projectId, projectId), eq(events.idempotencyKey, idempotencyKey)))
        .limit(1);
      return row;
    },

    async findById(projectId: string, id: string): Promise<EventRow | undefined> {
      const [row] = await db
        .select()
        .from(events)
        .where(and(eq(events.projectId, projectId), eq(events.id, id)))
        .limit(1);
      return row;
    },

    /**
     * Events with a greater sequence than the client last saw, oldest first. This is
     * the SSE resume path: a reconnecting client sends `Last-Event-ID` and gets the
     * gap replayed in write order.
     */
    async listAfterSequence(
      projectId: string,
      sequence: number,
      limit: number,
    ): Promise<EventRow[]> {
      return db
        .select()
        .from(events)
        .where(and(eq(events.projectId, projectId), gt(events.sequence, sequence)))
        .orderBy(asc(events.sequence))
        .limit(limit);
    },

    /** Late events recorded per project — the input for re-projection. */
    async listLateSince(projectId: string, since: Date): Promise<EventRow[]> {
      return db
        .select()
        .from(events)
        .where(and(eq(events.projectId, projectId), eq(events.isLate, true)))
        .orderBy(events.occurredAt)
        .limit(1000)
        .then((rows) => rows.filter((row) => row.receivedAt >= since));
    },

    /**
     * Full history for one entity, newest write first. Earlier payloads double as
     * the "base" snapshot for three-way merges, so ordering is by write order
     * (`sequence`), not by `occurred_at`.
     */
    async listForEntity(
      projectId: string,
      entityType: EventEntityType,
      entityId: string,
    ): Promise<EventRow[]> {
      return db
        .select()
        .from(events)
        .where(
          and(
            eq(events.projectId, projectId),
            eq(events.entityType, entityType),
            eq(events.entityId, entityId),
          ),
        )
        .orderBy(desc(events.sequence));
    },
  };
}

export type EventsRepository = ReturnType<typeof createEventsRepository>;
