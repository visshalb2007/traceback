import { and, arrayContains, between, desc, eq, lt, or } from 'drizzle-orm';
import type { ChangeType } from '@traceback/shared';
import type { DbExecutor } from '../../db/client';
import { changes, deployments } from '../../db/schema';
import type { ChangeRow, NewChangeRow } from '../../db/schema';

export interface ChangeListFilters {
  type?: ChangeType | undefined;
  service?: string | undefined;
  authorEmail?: string | undefined;
  deploymentId?: string | undefined;
  limit: number;
  /** Keyset cursor over (created_at, id). */
  cursorCreatedAt?: string | undefined;
  cursorId?: string | undefined;
}

export function createChangesRepository(db: DbExecutor) {
  return {
    async insert(row: NewChangeRow): Promise<ChangeRow> {
      const [inserted] = await db.insert(changes).values(row).returning();
      if (!inserted) throw new Error('failed to insert change');
      return inserted;
    },

    async findById(projectId: string, id: string): Promise<ChangeRow | undefined> {
      const [row] = await db
        .select()
        .from(changes)
        .where(and(eq(changes.projectId, projectId), eq(changes.id, id)))
        .limit(1);
      return row;
    },

    /** A git sha is unique within a project, so this is the natural dedupe key. */
    async findBySha(projectId: string, sha: string): Promise<ChangeRow | undefined> {
      const [row] = await db
        .select()
        .from(changes)
        .where(and(eq(changes.projectId, projectId), eq(changes.sha, sha)))
        .limit(1);
      return row;
    },

    async list(projectId: string, filters: ChangeListFilters): Promise<ChangeRow[]> {
      const conditions = [eq(changes.projectId, projectId)];

      if (filters.type) conditions.push(eq(changes.type, filters.type));
      if (filters.service) conditions.push(arrayContains(changes.services, [filters.service]));
      if (filters.authorEmail) conditions.push(eq(changes.authorEmail, filters.authorEmail));
      if (filters.deploymentId) conditions.push(eq(changes.deploymentId, filters.deploymentId));

      // Keyset over created_at (NOT NULL) rather than a business timestamp so
      // pagination stays deterministic for changes with no known commit time.
      if (filters.cursorCreatedAt && filters.cursorId) {
        const cursorDate = new Date(filters.cursorCreatedAt);
        const keyset = or(
          lt(changes.createdAt, cursorDate),
          and(eq(changes.createdAt, cursorDate), lt(changes.id, filters.cursorId)),
        );
        if (keyset) conditions.push(keyset);
      }

      return db
        .select()
        .from(changes)
        .where(and(...conditions))
        .orderBy(desc(changes.createdAt), desc(changes.id))
        .limit(filters.limit + 1);
    },

    /**
     * Cross-table check so a change can only be linked to a deployment that lives
     * in the same project. Cheaper than trusting the caller and cheaper than a
     * round trip through the deployments service.
     */
    async deploymentExists(projectId: string, deploymentId: string): Promise<boolean> {
      const [row] = await db
        .select({ id: deployments.id })
        .from(deployments)
        .where(and(eq(deployments.projectId, projectId), eq(deployments.id, deploymentId)))
        .limit(1);
      return Boolean(row);
    },

    /** Changes in a lookback window — the correlation engine's second candidate set. */
    async listInWindow(projectId: string, from: Date, to: Date, limit = 200): Promise<ChangeRow[]> {
      return db
        .select()
        .from(changes)
        .where(and(eq(changes.projectId, projectId), between(changes.createdAt, from, to)))
        .orderBy(desc(changes.createdAt))
        .limit(limit);
    },
  };
}

export type ChangesRepository = ReturnType<typeof createChangesRepository>;
