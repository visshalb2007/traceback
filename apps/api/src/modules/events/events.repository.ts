import { and, eq } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { events } from '../../db/schema';
import type { EventRow, NewEventRow } from '../../db/schema';

export function createEventsRepository(db: Database) {
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
  };
}

export type EventsRepository = ReturnType<typeof createEventsRepository>;
