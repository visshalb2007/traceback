import { sql } from 'drizzle-orm';
import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { incidentSeverityEnum, incidentStatusEnum } from './enums';
import { projects } from './projects';
import { users } from './users';

/**
 * Incidents. `fingerprint` is the normalised identity of the *problem* (title +
 * service + error signature) and is what powers recurring-issue detection.
 * `row_version` drives optimistic concurrency (If-Match / 409 with a diff).
 */
export const incidents = pgTable(
  'incidents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    severity: incidentSeverityEnum('severity').notNull().default('sev3'),
    status: incidentStatusEnum('status').notNull().default('open'),
    service: text('service'),
    errorSignature: text('error_signature'),
    affectedComponents: text('affected_components')
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    environment: text('environment'),
    fingerprint: text('fingerprint').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    detectedAt: timestamp('detected_at', { withTimezone: true }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolvedBy: uuid('resolved_by').references(() => users.id, { onDelete: 'set null' }),
    resolution: text('resolution'),
    rowVersion: integer('row_version').notNull().default(1),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // Recurring-issue grouping scans this directly.
    projectFingerprintIdx: index('incidents_project_fingerprint_idx').on(
      table.projectId,
      table.fingerprint,
    ),
    projectStartedIdx: index('incidents_project_started_idx').on(
      table.projectId,
      table.startedAt.desc(),
    ),
    projectStatusIdx: index('incidents_project_status_idx').on(table.projectId, table.status),
    projectSeverityIdx: index('incidents_project_severity_idx').on(table.projectId, table.severity),
  }),
);

export type IncidentRow = typeof incidents.$inferSelect;
export type NewIncidentRow = typeof incidents.$inferInsert;
