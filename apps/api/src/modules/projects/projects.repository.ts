import { and, desc, eq, isNull } from 'drizzle-orm';
import type { ProjectRole } from '@traceback/shared';
import type { Database } from '../../db/client';
import { projectMembers, projects } from '../../db/schema';
import type { NewProjectRow, ProjectRow } from '../../db/schema';

export interface ProjectWithRole {
  project: ProjectRow;
  role: ProjectRole;
}

export interface CreateProjectRow {
  name: string;
  slug: string;
  description?: string | null;
  repositoryUrl?: string | null;
  createdBy: string;
}

export interface UpdateProjectPatch {
  name?: string;
  description?: string | null;
  repositoryUrl?: string | null;
  updatedAt: Date;
}

export function createProjectsRepository(db: Database) {
  return {
    /**
     * Project + owner membership are created together: a project without an owner
     * would be unreachable through the RBAC guard.
     */
    async create(input: CreateProjectRow): Promise<ProjectRow> {
      return db.transaction(async (tx) => {
        const [project] = await tx
          .insert(projects)
          .values(input as NewProjectRow)
          .returning();
        if (!project) throw new Error('failed to insert project');

        await tx.insert(projectMembers).values({
          projectId: project.id,
          userId: input.createdBy,
          role: 'owner',
          updatedAt: new Date(),
        });

        return project;
      });
    },

    async findById(id: string): Promise<ProjectRow | undefined> {
      const [row] = await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, id), isNull(projects.deletedAt)))
        .limit(1);
      return row;
    },

    async findBySlug(slug: string): Promise<ProjectRow | undefined> {
      const [row] = await db.select().from(projects).where(eq(projects.slug, slug)).limit(1);
      return row;
    },

    async listForUser(userId: string): Promise<ProjectWithRole[]> {
      const rows = await db
        .select({ project: projects, role: projectMembers.role })
        .from(projectMembers)
        .innerJoin(projects, eq(projects.id, projectMembers.projectId))
        .where(and(eq(projectMembers.userId, userId), isNull(projects.deletedAt)))
        .orderBy(desc(projects.createdAt));

      return rows.map((row) => ({ project: row.project, role: row.role as ProjectRole }));
    },

    /**
     * Optimistic update: the WHERE clause carries the expected row_version, so a
     * concurrent writer makes this return nothing instead of silently clobbering.
     */
    async update(
      id: string,
      patch: UpdateProjectPatch,
      expectedRowVersion: number,
    ): Promise<ProjectRow | undefined> {
      const [row] = await db
        .update(projects)
        .set({ ...patch, rowVersion: expectedRowVersion + 1 })
        .where(and(eq(projects.id, id), eq(projects.rowVersion, expectedRowVersion)))
        .returning();
      return row;
    },

    async softDelete(id: string, at: Date): Promise<boolean> {
      const rows = await db
        .update(projects)
        .set({ deletedAt: at, updatedAt: at })
        .where(and(eq(projects.id, id), isNull(projects.deletedAt)))
        .returning({ id: projects.id });
      return rows.length > 0;
    },
  };
}

export type ProjectsRepository = ReturnType<typeof createProjectsRepository>;
