import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { auditActionEnum } from './enums';
import { projects } from './projects';
import { users } from './users';

/**
 * Immutable audit trail, written in the *same transaction* as the mutation it
 * describes. Never updated, never deleted. `before`/`after`/`diff` are stored so
 * the auditor does not need to reconstruct history from the event store.
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    actorEmail: text('actor_email'),
    action: auditActionEnum('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    before: jsonb('before').$type<Record<string, unknown> | null>(),
    after: jsonb('after').$type<Record<string, unknown> | null>(),
    diff: jsonb('diff').$type<Record<string, unknown> | null>(),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    projectCreatedIdx: index('audit_logs_project_created_idx').on(
      table.projectId,
      table.createdAt.desc(),
    ),
    actorIdx: index('audit_logs_actor_idx').on(table.actorId, table.createdAt.desc()),
    entityIdx: index('audit_logs_entity_idx').on(table.entityType, table.entityId),
    actionIdx: index('audit_logs_action_idx').on(table.action),
  }),
);

export type AuditLogRow = typeof auditLogs.$inferSelect;
export type NewAuditLogRow = typeof auditLogs.$inferInsert;

/** Helper type for the JSON diff payload. */
export type AuditDiff = Record<string, { before: unknown; after: unknown }> & {
  _meta?: Record<string, unknown>;
};
export const emptyJsonObject = sql`'{}'::jsonb`;
