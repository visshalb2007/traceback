import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { eventEntityTypeEnum, eventSourceEnum, eventTypeEnum } from './enums';
import { projects } from './projects';
import { users } from './users';

/**
 * The append-only event store. This table — not the entity tables — is the source
 * of truth for every timeline. Entity rows are projections of these events.
 *
 * Ordering is `(occurred_at, sequence)`: `occurred_at` is when the thing really
 * happened (client supplied and possibly backdated), `sequence` is a monotonic
 * tie-breaker assigned by Postgres on insert.
 */
export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    sequence: bigserial('sequence', { mode: 'number' }).notNull(),
    type: eventTypeEnum('type').notNull(),
    entityType: eventEntityTypeEnum('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    payload: jsonb('payload')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    /** True when occurred_at is older than received_at - threshold. */
    isLate: boolean('is_late').notNull().default(false),
    /** Client-supplied dedupe key; unique per project. */
    idempotencyKey: text('idempotency_key').notNull(),
    source: eventSourceEnum('source').notNull().default('api'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // Duplicate submissions must be detectable with an index, not a scan.
    idempotencyUnique: uniqueIndex('events_project_idempotency_idx').on(
      table.projectId,
      table.idempotencyKey,
    ),
    // The timeline read path.
    projectOccurredSequenceIdx: index('events_project_occurred_sequence_idx').on(
      table.projectId,
      table.occurredAt,
      table.sequence,
    ),
    // Late-event sweeps and "recently received" debugging.
    projectReceivedIdx: index('events_project_received_idx').on(table.projectId, table.receivedAt),
    entityIdx: index('events_entity_idx').on(table.entityType, table.entityId),
    projectTypeIdx: index('events_project_type_idx').on(table.projectId, table.type),
    lateIdx: index('events_late_idx').on(table.projectId, table.isLate),
  }),
);

export type EventRow = typeof events.$inferSelect;
export type NewEventRow = typeof events.$inferInsert;
