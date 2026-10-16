import { z } from 'zod';

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('traceback-api'),
  version: z.string(),
  uptimeSeconds: z.number(),
  timestamp: z.string(),
  checks: z.object({
    database: z.enum(['up', 'down']),
  }),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
