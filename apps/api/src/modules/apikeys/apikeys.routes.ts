import { z } from 'zod';
import {
  apiKeySchema,
  apiKeyWithSecretSchema,
  createApiKeySchema,
  errorResponseSchema,
} from '@traceback/shared';
import type { AppServer } from '../../types';
import { createApiKeysService } from './apikeys.service';
import { projectIdParamSchema } from '../projects/projects.routes';

const commonErrors = {
  400: errorResponseSchema,
  401: errorResponseSchema,
  403: errorResponseSchema,
  404: errorResponseSchema,
} as const;

const keyParamsSchema = projectIdParamSchema.extend({ keyId: z.string().uuid() });
const keyListSchema = z.object({ items: z.array(apiKeySchema) });

/** Request-scoped facts copied onto every audit row written by this module. */
function auditContext(request: {
  ip: string;
  headers: Record<string, string | string[] | undefined>;
}): { ip: string; userAgent: string | null } {
  const agent = request.headers['user-agent'];
  return { ip: request.ip, userAgent: typeof agent === 'string' ? agent : null };
}

export async function apiKeysRoutes(app: AppServer): Promise<void> {
  const service = createApiKeysService(app.db);

  app.get(
    '/projects/:projectId/api-keys',
    {
      preHandler: [app.requireAuth, app.authorize('apikey:manage')],
      schema: {
        params: projectIdParamSchema,
        response: { 200: keyListSchema, ...commonErrors },
      },
    },
    async (request) => ({ items: await service.list(request.params.projectId) }),
  );

  app.post(
    '/projects/:projectId/api-keys',
    {
      preHandler: [app.requireAuth, app.authorize('apikey:manage')],
      schema: {
        params: projectIdParamSchema,
        body: createApiKeySchema,
        response: { 201: apiKeyWithSecretSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      const key = await service.create(
        request.params.projectId,
        request.body,
        request.auth!.userId,
        request.projectRole ?? 'viewer',
        auditContext(request),
      );
      void reply
        .status(201)
        .header('location', `/api/v1/projects/${request.params.projectId}/api-keys/${key.id}`);
      return key;
    },
  );

  app.delete(
    '/projects/:projectId/api-keys/:keyId',
    {
      preHandler: [app.requireAuth, app.authorize('apikey:manage')],
      schema: { params: keyParamsSchema, response: { 204: z.null(), ...commonErrors } },
    },
    async (request, reply) => {
      await service.revoke(
        request.params.projectId,
        request.params.keyId,
        request.auth!.userId,
        auditContext(request),
      );
      return reply.status(204).send(null);
    },
  );
}
