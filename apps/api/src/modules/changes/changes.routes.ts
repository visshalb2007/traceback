import { z } from 'zod';
import {
  changeSchema,
  changeTypeSchema,
  errorResponseSchema,
  paginationQuerySchema,
  recordChangeSchema,
} from '@traceback/shared';
import type { AppServer } from '../../types';
import { createChangesService } from './changes.service';
import { projectIdParamSchema } from '../projects/projects.routes';

const commonErrors = {
  400: errorResponseSchema,
  401: errorResponseSchema,
  403: errorResponseSchema,
  404: errorResponseSchema,
  409: errorResponseSchema,
} as const;

const changeListSchema = z.object({
  items: z.array(changeSchema),
  nextCursor: z.string().nullable(),
});

const changeQuerySchema = paginationQuerySchema.extend({
  type: changeTypeSchema.optional(),
  service: z.string().max(120).optional(),
  authorEmail: z.string().email().max(320).optional(),
  deploymentId: z.string().uuid().optional(),
});

const changeParamsSchema = projectIdParamSchema.extend({
  changeId: z.string().uuid(),
});

export async function changesRoutes(app: AppServer): Promise<void> {
  const service = createChangesService(app.db, app.events);

  app.post(
    '/projects/:projectId/changes',
    {
      preHandler: [app.requireAuth, app.authorize('change:write')],
      schema: {
        params: projectIdParamSchema,
        body: recordChangeSchema,
        response: {
          200: changeSchema,
          201: changeSchema,
          ...commonErrors,
        },
      },
    },
    async (request, reply) => {
      const result = await service.record(
        request.params.projectId,
        request.body,
        request.auth!.userId,
      );

      if (result.replayed) {
        return reply.header('x-idempotent-replay', 'true').status(200).send(result);
      }

      void reply
        .status(201)
        .header('location', `/api/v1/projects/${request.params.projectId}/changes/${result.id}`);
      return result;
    },
  );

  app.get(
    '/projects/:projectId/changes',
    {
      preHandler: [app.requireAuth, app.authorize('change:read')],
      schema: {
        params: projectIdParamSchema,
        querystring: changeQuerySchema,
        response: { 200: changeListSchema, ...commonErrors },
      },
    },
    async (request) =>
      service.list(request.params.projectId, {
        type: request.query.type,
        service: request.query.service,
        authorEmail: request.query.authorEmail,
        deploymentId: request.query.deploymentId,
        limit: request.query.limit,
        cursor: request.query.cursor,
      }),
  );

  app.get(
    '/projects/:projectId/changes/:changeId',
    {
      preHandler: [app.requireAuth, app.authorize('change:read')],
      schema: {
        params: changeParamsSchema,
        response: { 200: changeSchema, ...commonErrors },
      },
    },
    async (request) => service.get(request.params.projectId, request.params.changeId),
  );
}
