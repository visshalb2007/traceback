import { and, eq } from 'drizzle-orm';
import type { ProjectRole } from '@traceback/shared';
import type { DbExecutor } from '../../db/client';
import { projectMembers, projects, users } from '../../db/schema';
import type { ProjectMemberRow } from '../../db/schema';

export interface MemberWithUser {
  id: string;
  projectId: string;
  userId: string;
  email: string;
  name: string;
  role: ProjectRole;
  createdAt: Date;
}

/**
 * Membership persistence. The policy layer only needs `findRole`; member
 * management (invite/update/remove) is layered on top by the members service.
 */
export function createMembersRepository(db: DbExecutor) {
  return {
    async findRole(projectId: string, userId: string): Promise<ProjectRole | undefined> {
      const [row] = await db
        .select({ role: projectMembers.role })
        .from(projectMembers)
        .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
        .limit(1);
      return row?.role;
    },

    async findMember(projectId: string, userId: string): Promise<ProjectMemberRow | undefined> {
      const [row] = await db
        .select()
        .from(projectMembers)
        .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
        .limit(1);
      return row;
    },

    async listMembers(projectId: string): Promise<MemberWithUser[]> {
      const rows = await db
        .select({
          id: projectMembers.id,
          projectId: projectMembers.projectId,
          userId: projectMembers.userId,
          role: projectMembers.role,
          createdAt: projectMembers.createdAt,
          email: users.email,
          name: users.name,
        })
        .from(projectMembers)
        .innerJoin(users, eq(users.id, projectMembers.userId))
        .where(eq(projectMembers.projectId, projectId))
        .orderBy(projectMembers.createdAt);

      return rows.map((row) => ({ ...row, role: row.role as ProjectRole }));
    },

    async insertMember(input: {
      projectId: string;
      userId: string;
      role: ProjectRole;
    }): Promise<ProjectMemberRow> {
      const [row] = await db
        .insert(projectMembers)
        .values({ ...input, updatedAt: new Date() })
        .returning();
      if (!row) throw new Error('failed to insert project member');
      return row;
    },

    async updateRole(
      projectId: string,
      userId: string,
      role: ProjectRole,
    ): Promise<ProjectMemberRow | undefined> {
      const [row] = await db
        .update(projectMembers)
        .set({ role, updatedAt: new Date() })
        .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
        .returning();
      return row;
    },

    async deleteMember(projectId: string, userId: string): Promise<boolean> {
      const rows = await db
        .delete(projectMembers)
        .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
        .returning({ id: projectMembers.id });
      return rows.length > 0;
    },

    async countOwners(projectId: string): Promise<number> {
      const rows = await db
        .select({ id: projectMembers.id })
        .from(projectMembers)
        .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.role, 'owner')));
      return rows.length;
    },

    /** Used when creating a project: the creator becomes owner in the same tx. */
    async findProjectById(projectId: string) {
      const [row] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
      return row;
    },
  };
}

export type MembersRepository = ReturnType<typeof createMembersRepository>;
