import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  incidentLinkEntityTypeEnum,
  incidentLinkSourceEnum,
  incidentLinkStatusEnum,
} from './enums';
import { incidents } from './incidents';
import { users } from './users';

/**
 * Cross-reference between an incident and a suspect entity (deployment or change).
 *
 * The plan named this `incident_deployment_links`; it is generalised to
 * `incident_links` with an `entity_type` because the correlation engine scores
 * *changes* as well as deployments, and duplicating the suggestion/score/feedback
 * machinery for a second table would have been the worse trade-off.
 *
 * `source` distinguishes human links from engine output, and the same row carries
 * the algorithm version + score + reasons so feedback remains explainable later.
 */
export const incidentLinks = pgTable(
  'incident_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    incidentId: uuid('incident_id')
      .notNull()
      .references(() => incidents.id, { onDelete: 'cascade' }),
    entityType: incidentLinkEntityTypeEnum('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    source: incidentLinkSourceEnum('source').notNull().default('manual'),
    status: incidentLinkStatusEnum('status').notNull().default('suggested'),
    /** 0..1 correlation score for suggested links; null for manual ones. */
    score: numeric('score', { precision: 5, scale: 4 }),
    reasons: jsonb('reasons')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    algorithmVersion: text('algorithm_version'),
    note: text('note'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // One row per (incident, entity): re-running correlation updates, never duplicates.
    incidentEntityUnique: uniqueIndex('incident_links_incident_entity_idx').on(
      table.incidentId,
      table.entityType,
      table.entityId,
    ),
    entityIdx: index('incident_links_entity_idx').on(table.entityType, table.entityId),
    statusIdx: index('incident_links_status_idx').on(table.incidentId, table.status),
  }),
);

export const incidentAssignees = pgTable(
  'incident_assignees',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    incidentId: uuid('incident_id')
      .notNull()
      .references(() => incidents.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('responder'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    incidentUserUnique: uniqueIndex('incident_assignees_incident_user_idx').on(
      table.incidentId,
      table.userId,
    ),
    userIdx: index('incident_assignees_user_idx').on(table.userId),
  }),
);

/**
 * Comments / timeline notes. Append-only by design: because rows are never
 * mutated, two responders commenting at the same time can never conflict.
 */
export const incidentUpdates = pgTable(
  'incident_updates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    incidentId: uuid('incident_id')
      .notNull()
      .references(() => incidents.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
    kind: text('kind').notNull().default('comment'),
    body: text('body').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    incidentCreatedIdx: index('incident_updates_incident_created_idx').on(
      table.incidentId,
      table.createdAt,
    ),
  }),
);

export type IncidentLinkRow = typeof incidentLinks.$inferSelect;
export type NewIncidentLinkRow = typeof incidentLinks.$inferInsert;
export type IncidentAssigneeRow = typeof incidentAssignees.$inferSelect;
export type IncidentUpdateRow = typeof incidentUpdates.$inferSelect;
export type NewIncidentUpdateRow = typeof incidentUpdates.$inferInsert;
