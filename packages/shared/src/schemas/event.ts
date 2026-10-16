import { z } from 'zod';
import { uuidSchema } from '../common';
import { eventEntityTypeSchema, eventSourceSchema, eventTypeSchema } from '../enums';

/**
 * The events table is append-only and is the source of truth for every timeline.
 * Entity tables only hold the *projection* of these events.
 */
export const createEventSchema = z.object({
  type: eventTypeSchema,
  entityType: eventEntityTypeSchema,
  entityId: uuidSchema,
  payload: z.record(z.unknown()).default({}),
  /** When the change really happened (client-supplied). Defaults to received time. */
  occurredAt: z.string().datetime({ offset: true }),
  idempotencyKey: z.string().min(1).max(200),
  source: eventSourceSchema.default('api'),
  actorId: uuidSchema.nullable().optional(),
});
export type CreateEventInput = z.infer<typeof createEventSchema>;

export const eventSchema = z.object({
  id: uuidSchema,
  projectId: uuidSchema,
  sequence: z.string(),
  type: eventTypeSchema,
  entityType: eventEntityTypeSchema,
  entityId: uuidSchema,
  actorId: uuidSchema.nullable(),
  payload: z.record(z.unknown()),
  occurredAt: z.string(),
  receivedAt: z.string(),
  isLate: z.boolean(),
  idempotencyKey: z.string(),
  source: eventSourceSchema,
});
export type Event = z.infer<typeof eventSchema>;

/** Raw row shape returned by the repository before mapping to the API contract. */
export const eventInsertResultSchema = z.object({
  event: eventSchema,
  replayed: z.boolean(),
});
export type EventInsertResult = z.infer<typeof eventInsertResultSchema>;
