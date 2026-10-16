import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { webhookDeliveryStatusEnum, webhookProviderEnum } from './enums';
import { projects } from './projects';

export const webhookEndpoints = pgTable(
  'webhook_endpoints',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    provider: webhookProviderEnum('provider').notNull().default('github'),
    name: text('name').notNull(),
    /**
     * HMAC secret. Stored verbatim because it must be replayed to verify the
     * signature; a production deployment should wrap this with KMS/column
     * encryption (see README: known limitations).
     */
    secret: text('secret').notNull(),
    events: jsonb('events')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    projectIdx: index('webhook_endpoints_project_idx').on(table.projectId),
  }),
);

/**
 * Every delivery attempt is recorded, and `(endpoint_id, delivery_id)` is unique
 * so a retried `X-GitHub-Delivery` is recognised as a duplicate instead of being
 * applied twice.
 */
export const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    endpointId: uuid('endpoint_id')
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    deliveryId: text('delivery_id').notNull(),
    event: text('event').notNull(),
    status: webhookDeliveryStatusEnum('status').notNull().default('received'),
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    error: text('error'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (table) => ({
    endpointDeliveryUnique: uniqueIndex('webhook_deliveries_endpoint_delivery_idx').on(
      table.endpointId,
      table.deliveryId,
    ),
    projectReceivedIdx: index('webhook_deliveries_project_received_idx').on(
      table.projectId,
      table.receivedAt.desc(),
    ),
  }),
);

export type WebhookEndpointRow = typeof webhookEndpoints.$inferSelect;
export type NewWebhookEndpointRow = typeof webhookEndpoints.$inferInsert;
export type WebhookDeliveryRow = typeof webhookDeliveries.$inferSelect;
export type NewWebhookDeliveryRow = typeof webhookDeliveries.$inferInsert;
