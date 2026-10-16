import { z } from 'zod';
import { uuidSchema } from '../common';
import { projectRoleSchema } from '../enums';

/**
 * API key *request* shapes live in `schemas/project` (they are part of the project
 * settings surface). This file adds the key's read model and the one-time secret
 * response, so the settings UI has a typed shape that never leaks the stored hash.
 */
export const apiKeySchema = z.object({
  id: uuidSchema,
  projectId: uuidSchema,
  name: z.string(),
  /** Public, non-secret identifier used to look the key up. */
  prefix: z.string(),
  role: projectRoleSchema,
  createdBy: uuidSchema.nullable(),
  lastUsedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type ApiKey = z.infer<typeof apiKeySchema>;

/** Returned exactly once, at creation time: the plaintext token plus its metadata. */
export const apiKeyWithSecretSchema = apiKeySchema.extend({
  token: z.string(),
});
export type ApiKeyWithSecret = z.infer<typeof apiKeyWithSecretSchema>;
