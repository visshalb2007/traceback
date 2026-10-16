import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    description: text('description'),
    repositoryUrl: text('repository_url'),
    /** Optimistic concurrency counter; bumped on every mutation. */
    rowVersion: integer('row_version').notNull().default(1),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    /** Soft delete — projects are never hard-deleted so events stay readable. */
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    slugIdx: index('projects_slug_idx').on(table.slug),
    deletedAtIdx: index('projects_deleted_at_idx').on(table.deletedAt),
  }),
);

export type ProjectRow = typeof projects.$inferSelect;
export type NewProjectRow = typeof projects.$inferInsert;
