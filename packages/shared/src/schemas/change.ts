import { z } from 'zod';
import { uuidSchema } from '../common';
import { changeTypeSchema } from '../enums';

export const recordChangeSchema = z.object({
  type: changeTypeSchema.default('commit'),
  sha: z.string().regex(/^[0-9a-f]{7,40}$/i, 'must be a hex git sha'),
  title: z.string().min(1).max(500),
  message: z.string().max(10000).optional(),
  authorEmail: z.string().email().optional(),
  authorName: z.string().max(120).optional(),
  branch: z.string().max(200).optional(),
  url: z.string().url().max(500).optional(),
  /** File paths touched by the change — a key signal for the correlation engine. */
  filesChanged: z.array(z.string().max(500)).max(500).default([]),
  /** Services/components affected — the other correlation signal. */
  services: z.array(z.string().max(120)).max(50).default([]),
  deploymentId: uuidSchema.optional(),
  occurredAt: z.string().datetime({ offset: true }).optional(),
  idempotencyKey: z.string().min(1).max(200).optional(),
});
export type RecordChangeInput = z.infer<typeof recordChangeSchema>;

export const changeSchema = z.object({
  id: uuidSchema,
  projectId: uuidSchema,
  deploymentId: uuidSchema.nullable(),
  type: changeTypeSchema,
  sha: z.string(),
  title: z.string(),
  message: z.string().nullable(),
  authorEmail: z.string().nullable(),
  authorName: z.string().nullable(),
  branch: z.string().nullable(),
  url: z.string().nullable(),
  filesChanged: z.array(z.string()),
  services: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Change = z.infer<typeof changeSchema>;
