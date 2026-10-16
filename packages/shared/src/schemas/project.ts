import { z } from 'zod';
import { slugSchema, uuidSchema } from '../common';

export const createProjectSchema = z.object({
  name: z.string().min(1).max(120),
  slug: slugSchema.optional(),
  description: z.string().max(2000).optional(),
  repositoryUrl: z.string().url().max(500).optional(),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    description: z.string().max(2000).nullable().optional(),
    repositoryUrl: z.string().url().max(500).nullable().optional(),
    rowVersion: z.number().int().nonnegative().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'no fields to update' });
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export const projectSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  repositoryUrl: z.string().nullable(),
  rowVersion: z.number().int(),
  deletedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Project = z.infer<typeof projectSchema>;

export const projectWithRoleSchema = projectSchema.extend({
  role: z.string(),
});
export type ProjectWithRole = z.infer<typeof projectWithRoleSchema>;

/** Used by the API key / token settings panel. */
export const createApiKeySchema = z.object({
  name: z.string().min(1).max(80),
  role: z.enum(['maintainer', 'member', 'viewer']).default('member'),
});
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
