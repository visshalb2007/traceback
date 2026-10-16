import { z } from 'zod';
import { uuidSchema } from '../common';
import { auditActionSchema } from '../enums';

export const auditLogSchema = z.object({
  id: uuidSchema,
  projectId: uuidSchema.nullable(),
  actorId: uuidSchema.nullable(),
  actorEmail: z.string().nullable(),
  action: auditActionSchema,
  entityType: z.string(),
  entityId: z.string(),
  before: z.record(z.unknown()).nullable(),
  after: z.record(z.unknown()).nullable(),
  diff: z.record(z.unknown()).nullable(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  createdAt: z.string(),
});
export type AuditLog = z.infer<typeof auditLogSchema>;

export const auditQuerySchema = z.object({
  action: auditActionSchema.optional(),
  entityType: z.string().max(60).optional(),
  entityId: z.string().max(120).optional(),
  actorId: uuidSchema.optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});
export type AuditQuery = z.infer<typeof auditQuerySchema>;
