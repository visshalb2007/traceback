import { z } from 'zod';

/** Reusable primitives shared across every module. */

export const uuidSchema = z.string().uuid();

export const isoDateTimeSchema = z
  .string()
  .datetime({ offset: true, message: 'must be an ISO-8601 datetime' });

/** Accepts ISO strings from the wire and coerces to a Date for the service layer. */
export const dateSchema = z.coerce.date();

export const idParamSchema = z.object({ id: uuidSchema });

export const emailSchema = z.string().email().max(320).toLowerCase();

export const slugSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be a lowercase kebab-case slug');

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export function paginatedSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
  });
}

export const errorCodeSchema = z.enum([
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'VERSION_CONFLICT',
  'INVALID_TRANSITION',
  'INVALID_MERGE',
  'IDEMPOTENCY_REPLAY',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
]);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

/** The one and only error envelope every endpoint returns. */
export const errorResponseSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;

/** Metadata attached to every successfully written event. */
export const eventMetaSchema = z.object({
  occurredAt: isoDateTimeSchema.optional(),
  idempotencyKey: z.string().min(1).max(200).optional(),
});
export type EventMeta = z.infer<typeof eventMetaSchema>;
