import { z } from 'zod';
import { eventEntityTypeSchema, eventSourceSchema, eventTypeSchema } from '../enums';

/**
 * Timeline ordering is by `occurred_at` (when it really happened) with `sequence`
 * as a tie-breaker, so late/backdated events slot into the right place.
 */
export const timelineQuerySchema = z.object({
  type: z
    .string()
    .optional()
    .transform((value) => (value ? value.split(',').filter(Boolean) : undefined))
    .pipe(z.array(eventTypeSchema).optional()),
  entityType: eventEntityTypeSchema.optional(),
  entityId: z.string().uuid().optional(),
  actorId: z.string().uuid().optional(),
  environment: z.string().optional(),
  source: eventSourceSchema.optional(),
  isLate: z.coerce.boolean().optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  /** Cursor is `<occurred_at>|<sequence>` — opaque to clients. */
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  order: z.enum(['asc', 'desc']).default('desc'),
});
export type TimelineQuery = z.infer<typeof timelineQuerySchema>;

export const timelineItemSchema = z.object({
  id: z.string().uuid(),
  sequence: z.string(),
  projectId: z.string().uuid(),
  type: eventTypeSchema,
  entityType: eventEntityTypeSchema,
  entityId: z.string().uuid(),
  actorId: z.string().nullable(),
  actorName: z.string().nullable(),
  payload: z.record(z.unknown()),
  summary: z.string(),
  occurredAt: z.string(),
  receivedAt: z.string(),
  isLate: z.boolean(),
  source: eventSourceSchema,
});
export type TimelineItem = z.infer<typeof timelineItemSchema>;
