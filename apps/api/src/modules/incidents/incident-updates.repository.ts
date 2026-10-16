import { and, asc, eq } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { incidentUpdates, users } from '../../db/schema';
import type { IncidentUpdateRow, NewIncidentUpdateRow } from '../../db/schema';

/**
 * Comments and timeline notes are append-only: no update or delete path exists, so
 * two responders writing at once can never conflict over a comment.
 */
export function createIncidentUpdatesRepository(db: Database) {
  return {
    async insert(row: NewIncidentUpdateRow): Promise<IncidentUpdateRow> {
      const [inserted] = await db.insert(incidentUpdates).values(row).returning();
      if (!inserted) throw new Error('failed to insert incident update');
      return inserted;
    },

    async listByIncident(incidentId: string): Promise<IncidentUpdateRow[]> {
      return db
        .select()
        .from(incidentUpdates)
        .where(eq(incidentUpdates.incidentId, incidentId))
        .orderBy(asc(incidentUpdates.createdAt), asc(incidentUpdates.id));
    },

    /** Reads back one update row to return the author alongside it. */
    async findByIdWithAuthor(
      incidentId: string,
      id: string,
    ): Promise<
      | { update: IncidentUpdateRow; authorName: string | null; authorEmail: string | null }
      | undefined
    > {
      const [row] = await db
        .select({
          update: incidentUpdates,
          authorName: users.name,
          authorEmail: users.email,
        })
        .from(incidentUpdates)
        .leftJoin(users, eq(users.id, incidentUpdates.authorId))
        .where(and(eq(incidentUpdates.incidentId, incidentId), eq(incidentUpdates.id, id)))
        .limit(1);
      return row;
    },
  };
}

export type IncidentUpdatesRepository = ReturnType<typeof createIncidentUpdatesRepository>;
