import { z } from 'zod';
import { uuidSchema } from '../common';
import { deploymentStatusSchema, environmentSchema } from '../enums';

/**
 * Deployments are frequently reported in two phases: a webhook fires the moment a
 * deploy starts (only a service + environment may be known), and the rest of the data
 * arrives later via PATCH. Everything except `service` and `environment` is optional.
 *
 * `version` is the release identifier (e.g. v1.4.2). The optimistic-concurrency
 * counter is named `rowVersion` everywhere so it cannot collide with release versions.
 */
export const recordDeploymentSchema = z.object({
  service: z.string().min(1).max(120),
  environment: environmentSchema,
  status: deploymentStatusSchema.default('unknown'),
  version: z.string().max(120).optional(),
  commitSha: z
    .string()
    .regex(/^[0-9a-f]{7,40}$/i, 'must be a hex git sha')
    .optional(),
  commitMessage: z.string().max(2000).optional(),
  branch: z.string().max(200).optional(),
  authorEmail: z.string().email().optional(),
  authorName: z.string().max(120).optional(),
  url: z.string().url().max(500).optional(),
  externalId: z.string().max(200).optional(),
  startedAt: z.string().datetime({ offset: true }).optional(),
  finishedAt: z.string().datetime({ offset: true }).optional(),
  occurredAt: z.string().datetime({ offset: true }).optional(),
  idempotencyKey: z.string().min(1).max(200).optional(),
});
export type RecordDeploymentInput = z.infer<typeof recordDeploymentSchema>;

/** Enrichment patch: any subset of the fields that may have been missing at first. */
export const enrichDeploymentSchema = z
  .object({
    status: deploymentStatusSchema.optional(),
    version: z.string().max(120).nullable().optional(),
    commitSha: z
      .string()
      .regex(/^[0-9a-f]{7,40}$/i)
      .nullable()
      .optional(),
    commitMessage: z.string().max(2000).nullable().optional(),
    branch: z.string().max(200).nullable().optional(),
    authorEmail: z.string().email().nullable().optional(),
    authorName: z.string().max(120).nullable().optional(),
    url: z.string().url().max(500).nullable().optional(),
    finishedAt: z.string().datetime({ offset: true }).nullable().optional(),
    occurredAt: z.string().datetime({ offset: true }).optional(),
    idempotencyKey: z.string().min(1).max(200).optional(),
    rowVersion: z.number().int().nonnegative().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'no fields to update' });
export type EnrichDeploymentInput = z.infer<typeof enrichDeploymentSchema>;

export const deploymentCompletenessSchema = z.object({
  hasCommit: z.boolean(),
  hasAuthor: z.boolean(),
  hasFinishedAt: z.boolean(),
  isTerminal: z.boolean(),
  score: z.number().min(0).max(1),
});
export type DeploymentCompleteness = z.infer<typeof deploymentCompletenessSchema>;

export const deploymentSchema = z.object({
  id: uuidSchema,
  projectId: uuidSchema,
  service: z.string(),
  environment: environmentSchema,
  status: deploymentStatusSchema,
  version: z.string().nullable(),
  commitSha: z.string().nullable(),
  commitMessage: z.string().nullable(),
  branch: z.string().nullable(),
  authorEmail: z.string().nullable(),
  authorName: z.string().nullable(),
  url: z.string().nullable(),
  externalId: z.string().nullable(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  rowVersion: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Deployment = z.infer<typeof deploymentSchema>;
