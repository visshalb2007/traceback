import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { deploymentStatusEnum, environmentEnum } from './enums';
import { projects } from './projects';

/**
 * Deployments are recorded in two phases. The first write may only know the
 * service + environment (status unknown, no commit sha); the rest arrives later
 * via PATCH. Nothing but project_id/service/environment is guaranteed.
 */
export const deployments = pgTable(
  'deployments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    service: text('service').notNull(),
    environment: environmentEnum('environment').notNull(),
    status: deploymentStatusEnum('status').notNull().default('unknown'),
    /** Release identifier, e.g. v1.4.2 (distinct from the row_version counter). */
    version: text('version'),
    commitSha: text('commit_sha'),
    commitMessage: text('commit_message'),
    branch: text('branch'),
    authorEmail: text('author_email'),
    authorName: text('author_name'),
    url: text('url'),
    /** Provider-side id (e.g. GitHub deployment id) used to enrich later. */
    externalId: text('external_id'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    rowVersion: integer('row_version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // The correlation engine scans this window per project, newest first.
    projectStartedIdx: index('deployments_project_started_idx').on(
      table.projectId,
      table.startedAt.desc(),
    ),
    projectServiceIdx: index('deployments_project_service_idx').on(
      table.projectId,
      table.service,
      table.environment,
    ),
    commitShaIdx: index('deployments_commit_sha_idx').on(table.projectId, table.commitSha),
    externalIdIdx: index('deployments_external_id_idx').on(table.projectId, table.externalId),
  }),
);

export type DeploymentRow = typeof deployments.$inferSelect;
export type NewDeploymentRow = typeof deployments.$inferInsert;
