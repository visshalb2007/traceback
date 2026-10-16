import { index, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { projectRoleEnum } from './enums';
import { projects } from './projects';
import { users } from './users';

export const projectMembers = pgTable(
  'project_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: projectRoleEnum('role').notNull().default('member'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // A user has exactly one role per project.
    projectUserUnique: uniqueIndex('project_members_project_user_idx').on(
      table.projectId,
      table.userId,
    ),
    userIdx: index('project_members_user_idx').on(table.userId),
  }),
);

export type ProjectMemberRow = typeof projectMembers.$inferSelect;
export type NewProjectMemberRow = typeof projectMembers.$inferInsert;
