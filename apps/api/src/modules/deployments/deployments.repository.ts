import { and, desc, eq, lt, or, sql } from 'drizzle-orm';
import type { DeploymentStatus, Environment } from '@traceback/shared';
import type { Database } from '../../db/client';
import { deployments } from '../../db/schema';
import type { DeploymentRow, NewDeploymentRow } from '../../db/schema';

export interface DeploymentListFilters {
  environment?: Environment | undefined;
  status?: DeploymentStatus | undefined;
  service?: string | undefined;
  limit: number;
  /** Keyset cursor over (created_at, id). */
  cursorCreatedAt?: string | undefined;
  cursorId?: string | undefined;
}

export interface DeploymentPatch {
  status?: DeploymentStatus;
  version?: string | null;
  commitSha?: string | null;
  commitMessage?: string | null;
  branch?: string | null;
  authorEmail?: string | null;
  authorName?: string | null;
  url?: string | null;
  finishedAt?: Date | null;
  updatedAt: Date;
}

export function createDeploymentsRepository(db: Database) {
  return {
    async insert(row: NewDeploymentRow): Promise<DeploymentRow> {
      const [inserted] = await db.insert(deployments).values(row).returning();
      if (!inserted) throw new Error('failed to insert deployment');
      return inserted;
    },

    async findById(projectId: string, id: string): Promise<DeploymentRow | undefined> {
      const [row] = await db
        .select()
        .from(deployments)
        .where(and(eq(deployments.projectId, projectId), eq(deployments.id, id)))
        .limit(1);
      return row;
    },

    async list(projectId: string, filters: DeploymentListFilters): Promise<DeploymentRow[]> {
      const conditions = [eq(deployments.projectId, projectId)];

      if (filters.environment) conditions.push(eq(deployments.environment, filters.environment));
      if (filters.status) conditions.push(eq(deployments.status, filters.status));
      if (filters.service) conditions.push(eq(deployments.service, filters.service));

      // Keyset pagination over a NOT NULL column so incomplete rows (null
      // started_at) still paginate deterministically.
      if (filters.cursorCreatedAt && filters.cursorId) {
        const cursorDate = new Date(filters.cursorCreatedAt);
        const keyset = or(
          lt(deployments.createdAt, cursorDate),
          and(eq(deployments.createdAt, cursorDate), lt(deployments.id, filters.cursorId)),
        );
        if (keyset) conditions.push(keyset);
      }

      return db
        .select()
        .from(deployments)
        .where(and(...conditions))
        .orderBy(desc(deployments.createdAt), desc(deployments.id))
        .limit(filters.limit + 1);
    },

    async update(
      projectId: string,
      id: string,
      patch: DeploymentPatch,
      expectedRowVersion: number,
    ): Promise<DeploymentRow | undefined> {
      const [row] = await db
        .update(deployments)
        .set({ ...patch, rowVersion: expectedRowVersion + 1 })
        .where(
          and(
            eq(deployments.projectId, projectId),
            eq(deployments.id, id),
            eq(deployments.rowVersion, expectedRowVersion),
          ),
        )
        .returning();
      return row;
    },

    /** Deployments in a lookback window — the correlation engine's candidate set. */
    async listInWindow(
      projectId: string,
      from: Date,
      to: Date,
      limit = 200,
    ): Promise<DeploymentRow[]> {
      return db
        .select()
        .from(deployments)
        .where(
          and(
            eq(deployments.projectId, projectId),
            sql`coalesce(${deployments.finishedAt}, ${deployments.startedAt}, ${deployments.createdAt}) between ${from} and ${to}`,
          ),
        )
        .orderBy(desc(deployments.createdAt))
        .limit(limit);
    },
  };
}

export type DeploymentsRepository = ReturnType<typeof createDeploymentsRepository>;
