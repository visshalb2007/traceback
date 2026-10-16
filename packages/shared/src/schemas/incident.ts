import { z } from 'zod';
import { uuidSchema } from '../common';
import {
  incidentLinkEntityTypeSchema,
  incidentLinkSourceSchema,
  incidentLinkStatusSchema,
  incidentSeveritySchema,
  incidentStatusSchema,
} from '../enums';

export const createIncidentSchema = z.object({
  title: z.string().min(3).max(300),
  description: z.string().max(20000).optional(),
  severity: incidentSeveritySchema.default('sev3'),
  status: incidentStatusSchema.default('open'),
  service: z.string().max(120).optional(),
  /** Free-form error signature; combined with title + service to build the fingerprint. */
  errorSignature: z.string().max(2000).optional(),
  /** Comma-free list of affected components/services used by correlation. */
  affectedComponents: z.array(z.string().max(200)).max(50).default([]),
  environment: z.string().max(60).optional(),
  startedAt: z.string().datetime({ offset: true }),
  detectedAt: z.string().datetime({ offset: true }).optional(),
  resolvedAt: z.string().datetime({ offset: true }).optional(),
  occurredAt: z.string().datetime({ offset: true }).optional(),
  idempotencyKey: z.string().min(1).max(200).optional(),
});
export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;

export const updateIncidentSchema = z
  .object({
    title: z.string().min(3).max(300).optional(),
    description: z.string().max(20000).nullable().optional(),
    severity: incidentSeveritySchema.optional(),
    service: z.string().max(120).nullable().optional(),
    errorSignature: z.string().max(2000).nullable().optional(),
    affectedComponents: z.array(z.string().max(200)).max(50).optional(),
    environment: z.string().max(60).nullable().optional(),
    /** `expected` drives optimistic concurrency (If-Match equivalent in the body). */
    expectedRowVersion: z.number().int().nonnegative().optional(),
    occurredAt: z.string().datetime({ offset: true }).optional(),
    idempotencyKey: z.string().min(1).max(200).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'no fields to update' });
export type UpdateIncidentInput = z.infer<typeof updateIncidentSchema>;

export const changeIncidentStatusSchema = z.object({
  status: incidentStatusSchema,
  note: z.string().max(4000).optional(),
  expectedRowVersion: z.number().int().nonnegative().optional(),
  occurredAt: z.string().datetime({ offset: true }).optional(),
  idempotencyKey: z.string().min(1).max(200).optional(),
});
export type ChangeIncidentStatusInput = z.infer<typeof changeIncidentStatusSchema>;

export const addAssigneeSchema = z.object({
  userId: uuidSchema,
  role: z.string().max(60).default('responder'),
});
export type AddAssigneeInput = z.infer<typeof addAssigneeSchema>;

export const incidentCommentSchema = z.object({
  body: z.string().min(1).max(20000),
  /** kind distinguishes free comments from resolution notes in the timeline. */
  kind: z.enum(['comment', 'resolution_note', 'timeline_note']).default('comment'),
  occurredAt: z.string().datetime({ offset: true }).optional(),
  idempotencyKey: z.string().min(1).max(200).optional(),
});
export type IncidentCommentInput = z.infer<typeof incidentCommentSchema>;

export const linkIncidentSchema = z.object({
  entityType: incidentLinkEntityTypeSchema,
  entityId: uuidSchema,
  note: z.string().max(2000).optional(),
  idempotencyKey: z.string().min(1).max(200).optional(),
});
export type LinkIncidentInput = z.infer<typeof linkIncidentSchema>;

export const incidentLinkSchema = z.object({
  id: uuidSchema,
  incidentId: uuidSchema,
  entityType: incidentLinkEntityTypeSchema,
  entityId: uuidSchema,
  source: incidentLinkSourceSchema,
  status: incidentLinkStatusSchema,
  score: z.number().min(0).max(1).nullable(),
  reasons: z.array(z.string()),
  algorithmVersion: z.string().nullable(),
  note: z.string().nullable(),
  createdBy: uuidSchema.nullable(),
  createdAt: z.string(),
});
export type IncidentLink = z.infer<typeof incidentLinkSchema>;

export const incidentSchema = z.object({
  id: uuidSchema,
  projectId: uuidSchema,
  title: z.string(),
  description: z.string().nullable(),
  severity: incidentSeveritySchema,
  status: incidentStatusSchema,
  service: z.string().nullable(),
  errorSignature: z.string().nullable(),
  affectedComponents: z.array(z.string()),
  environment: z.string().nullable(),
  fingerprint: z.string(),
  startedAt: z.string(),
  detectedAt: z.string().nullable(),
  resolvedAt: z.string().nullable(),
  resolvedBy: uuidSchema.nullable(),
  resolution: z.string().nullable(),
  rowVersion: z.number().int(),
  createdBy: uuidSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Incident = z.infer<typeof incidentSchema>;

export const incidentDetailSchema = incidentSchema.extend({
  assignees: z.array(
    z.object({
      userId: uuidSchema,
      name: z.string(),
      email: z.string().email(),
      role: z.string(),
    }),
  ),
  links: z.array(incidentLinkSchema),
});
export type IncidentDetail = z.infer<typeof incidentDetailSchema>;

export const incidentQuerySchema = z.object({
  status: incidentStatusSchema.optional(),
  severity: incidentSeveritySchema.optional(),
  service: z.string().optional(),
  fingerprint: z.string().optional(),
  search: z.string().max(200).optional(),
  sort: z.enum(['startedAt', 'severity', 'status', 'updatedAt']).default('startedAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});
export type IncidentQuery = z.infer<typeof incidentQuerySchema>;
