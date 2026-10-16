import { z } from 'zod';

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('traceback-api'),
  version: z.string(),
  uptimeSeconds: z.number(),
  timestamp: z.string(),
  checks: z.object({
    database: z.enum(['up', 'down', 'skipped']),
  }),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const readinessResponseSchema = z.object({
  status: z.enum(['ready', 'degraded']),
  checks: z.record(z.string(), z.enum(['up', 'down', 'skipped'])),
});
export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;
