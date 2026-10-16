import { z } from 'zod';
import {
  changeIncidentStatusSchema,
  createIncidentSchema,
  errorResponseSchema,
  incidentCommentSchema,
  incidentQuerySchema,
  incidentSchema,
  incidentUpdateSchema,
  updateIncidentSchema,
} from '@traceback/shared';
import type { AppServer } from '../../types';
import { parseIfMatch } from '../../lib/http';
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

const updateListSchema = z.object({ items: z.array(incidentUpdateSchema) });

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

  app.patch(
    '/projects/:projectId/incidents/:incidentId',
    {
      preHandler: [app.requireAuth, app.authorize('incident:update')],
      schema: {
        params: incidentParamsSchema,
        body: updateIncidentSchema,
        response: { 200: incidentSchema, ...commonErrors },
      },
    },
    async (request) => {
      // Accept the optimistic-concurrency version from the body or an `If-Match`
      // header; the body wins if both are present.
      const ifMatch = parseIfMatch(request.headers['if-match']);
      const input =
        request.body.expectedRowVersion === undefined && ifMatch !== undefined
          ? { ...request.body, expectedRowVersion: ifMatch }
          : request.body;

      return service.update(
        request.params.projectId,
        request.params.incidentId,
        input,
        request.auth!.userId,
      );
    },
  );

  app.post(
    '/projects/:projectId/incidents/:incidentId/status',
    {
      preHandler: [app.requireAuth, app.authorize('incident:update')],
      schema: {
        params: incidentParamsSchema,
        body: changeIncidentStatusSchema,
        response: { 200: incidentSchema, ...commonErrors },
      },
    },
    async (request) =>
      service.changeStatus(
        request.params.projectId,
        request.params.incidentId,
        request.body,
        request.auth!.userId,
      ),
  );

  app.post(
    '/projects/:projectId/incidents/:incidentId/updates',
    {
      preHandler: [app.requireAuth, app.authorize('incident:comment')],
      schema: {
        params: incidentParamsSchema,
        body: incidentCommentSchema,
        response: { 201: incidentUpdateSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      const update = await service.addComment(
        request.params.projectId,
        request.params.incidentId,
        request.body,
        request.auth!.userId,
      );
      void reply
        .status(201)
        .header(
          'location',
          `/api/v1/projects/${request.params.projectId}/incidents/${request.params.incidentId}/updates/${update.id}`,
        );
      return update;
    },
  );

  app.get(
    '/projects/:projectId/incidents/:incidentId/updates',
    {
      preHandler: [app.requireAuth, app.authorize('incident:read')],
      schema: {
        params: incidentParamsSchema,
        response: { 200: updateListSchema, ...commonErrors },
      },
    },
    async (request) => ({
      items: await service.listUpdates(request.params.projectId, request.params.incidentId),
    }),
  );
}
