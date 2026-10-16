import { z } from 'zod';
import {
  createIncidentSchema,
  errorResponseSchema,
  incidentQuerySchema,
  incidentSchema,
} from '@traceback/shared';
import type { AppServer } from '../../types';
import { createIncidentsService } from './incidents.service';
import { projectIdParamSchema } from '../projects/projects.routes';

const commonErrors = {
  400: errorResponseSchema,
  401: errorResponseSchema,
  403: errorResponseSchema,
  404: errorResponseSchema,
  409: errorResponseSchema,
  422: errorResponseSchema,
} as const;

const incidentListSchema = z.object({
  items: z.array(incidentSchema),
  nextCursor: z.string().nullable(),
});

const incidentParamsSchema = projectIdParamSchema.extend({
  incidentId: z.string().uuid(),
});

export async function incidentsRoutes(app: AppServer): Promise<void> {
  const service = createIncidentsService(app.db, app.events);

  app.post(
    '/projects/:projectId/incidents',
    {
      preHandler: [app.requireAuth, app.authorize('incident:create')],
      schema: {
        params: projectIdParamSchema,
        body: createIncidentSchema,
        response: { 200: incidentSchema, 201: incidentSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      const result = await service.create(
        request.params.projectId,
        request.body,
        request.auth!.userId,
      );

      if (result.replayed) {
        return reply.header('x-idempotent-replay', 'true').status(200).send(result);
      }

      void reply
        .status(201)
        .header('location', `/api/v1/projects/${request.params.projectId}/incidents/${result.id}`);
      return result;
    },
  );

  app.get(
    '/projects/:projectId/incidents',
    {
      preHandler: [app.requireAuth, app.authorize('incident:read')],
      schema: {
        params: projectIdParamSchema,
        querystring: incidentQuerySchema,
        response: { 200: incidentListSchema, ...commonErrors },
      },
    },
    async (request) =>
      service.list(request.params.projectId, {
        status: request.query.status,
        severity: request.query.severity,
        service: request.query.service,
        fingerprint: request.query.fingerprint,
        search: request.query.search,
        sort: request.query.sort,
        order: request.query.order,
        limit: request.query.limit,
        cursor: request.query.cursor,
      }),
  );

  app.get(
    '/projects/:projectId/incidents/:incidentId',
    {
      preHandler: [app.requireAuth, app.authorize('incident:read')],
      schema: {
        params: incidentParamsSchema,
        response: { 200: incidentSchema, ...commonErrors },
      },
    },
    async (request) => service.get(request.params.projectId, request.params.incidentId),
  );
}
