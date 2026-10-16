import { z } from 'zod';
import {
  deploymentCompletenessSchema,
  deploymentSchema,
  deploymentStatusSchema,
  enrichDeploymentSchema,
  environmentSchema,
  errorResponseSchema,
  paginationQuerySchema,
  recordDeploymentSchema,
} from '@traceback/shared';
import type { AppServer } from '../../types';
import { createDeploymentsService } from './deployments.service';
import { projectIdParamSchema } from '../projects/projects.routes';

const commonErrors = {
  400: errorResponseSchema,
  401: errorResponseSchema,
  403: errorResponseSchema,
  404: errorResponseSchema,
  409: errorResponseSchema,
} as const;

/** Completeness is computed on read, not stored, so it is layered onto the DTO. */
export const deploymentResponseSchema = deploymentSchema.extend({
  completeness: deploymentCompletenessSchema,
});

const deploymentListSchema = z.object({
  items: z.array(deploymentResponseSchema),
  nextCursor: z.string().nullable(),
});

const deploymentQuerySchema = paginationQuerySchema.extend({
  environment: environmentSchema.optional(),
  status: deploymentStatusSchema.optional(),
  service: z.string().max(120).optional(),
});

const deploymentParamsSchema = projectIdParamSchema.extend({
  deploymentId: z.string().uuid(),
});

/** Request-scoped facts copied onto every audit row written by this module. */
function auditContext(request: {
  ip: string;
  headers: Record<string, string | string[] | undefined>;
}): { ip: string; userAgent: string | null } {
  const agent = request.headers['user-agent'];
  return { ip: request.ip, userAgent: typeof agent === 'string' ? agent : null };
}

export async function deploymentsRoutes(app: AppServer): Promise<void> {
  const service = createDeploymentsService(app.db, app.events);

  app.post(
    '/projects/:projectId/deployments',
    {
      preHandler: [app.requireAuth, app.authorize('deployment:write')],
      schema: {
        params: projectIdParamSchema,
        body: recordDeploymentSchema,
        response: {
          200: deploymentResponseSchema,
          201: deploymentResponseSchema,
          ...commonErrors,
        },
      },
    },
    async (request, reply) => {
      const result = await service.record(
        request.params.projectId,
        request.body,
        request.auth!.userId,
        auditContext(request),
      );

      if (result.replayed) {
        return reply.header('x-idempotent-replay', 'true').status(200).send(result);
      }

      void reply
        .status(201)
        .header(
          'location',
          `/api/v1/projects/${request.params.projectId}/deployments/${result.id}`,
        );
      return result;
    },
  );

  app.get(
    '/projects/:projectId/deployments',
    {
      preHandler: [app.requireAuth, app.authorize('deployment:read')],
      schema: {
        params: projectIdParamSchema,
        querystring: deploymentQuerySchema,
        response: { 200: deploymentListSchema, ...commonErrors },
      },
    },
    async (request) =>
      service.list(request.params.projectId, {
        environment: request.query.environment,
        status: request.query.status,
        service: request.query.service,
        limit: request.query.limit,
        cursor: request.query.cursor,
      }),
  );

  app.get(
    '/projects/:projectId/deployments/:deploymentId',
    {
      preHandler: [app.requireAuth, app.authorize('deployment:read')],
      schema: {
        params: deploymentParamsSchema,
        response: { 200: deploymentResponseSchema, ...commonErrors },
      },
    },
    async (request) => service.get(request.params.projectId, request.params.deploymentId),
  );

  app.patch(
    '/projects/:projectId/deployments/:deploymentId',
    {
      preHandler: [app.requireAuth, app.authorize('deployment:write')],
      schema: {
        params: deploymentParamsSchema,
        body: enrichDeploymentSchema,
        response: { 200: deploymentResponseSchema, ...commonErrors },
      },
    },
    async (request) =>
      service.enrich(
        request.params.projectId,
        request.params.deploymentId,
        request.body,
        request.auth!.userId,
        auditContext(request),
      ),
  );
}
