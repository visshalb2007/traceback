import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { changeTypeEnum } from './enums';
import { deployments } from './deployments';
import { projects } from './projects';

/**
 * A code change (commit, pull request or merge). `files_changed` and `services`
 * are denormalised arrays because they are read on the correlation hot path —
 * a join table would cost a round trip and lose the "did any file overlap?"
 * query simplicity.
 */
export const changes = pgTable(
  'changes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    /** Set when the change is known to be part of a deployment. */
    deploymentId: uuid('deployment_id').references(() => deployments.id, { onDelete: 'set null' }),
    type: changeTypeEnum('type').notNull().default('commit'),
    sha: text('sha').notNull(),
    title: text('title').notNull(),
    message: text('message'),
    authorEmail: text('author_email'),
    authorName: text('author_name'),
    branch: text('branch'),
    url: text('url'),
    filesChanged: text('files_changed')
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    services: text('services')
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // A sha is unique within a repository, so re-delivery is a no-op.
    projectShaUnique: uniqueIndex('changes_project_sha_idx').on(table.projectId, table.sha),
    projectCreatedIdx: index('changes_project_created_idx').on(
      table.projectId,
      table.createdAt.desc(),
    ),
    authorIdx: index('changes_project_author_idx').on(table.projectId, table.authorEmail),
    // GIN so `files_changed && ARRAY[...]` (overlap) stays fast.
    filesChangedGin: index('changes_files_changed_gin').using('gin', table.filesChanged),
    servicesGin: index('changes_services_gin').using('gin', table.services),
  }),
);

export type ChangeRow = typeof changes.$inferSelect;
export type NewChangeRow = typeof changes.$inferInsert;
