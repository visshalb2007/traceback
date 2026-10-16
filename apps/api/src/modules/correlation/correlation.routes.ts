import { z } from 'zod';
import {
  correlationResultSchema,
  errorResponseSchema,
  incidentLinkSchema,
  linkIncidentSchema,
  rerunCorrelationSchema,
  suggestionDecisionSchema,
} from '@traceback/shared';
import type { AppServer } from '../../types';
import { createCorrelationService } from './correlation.service';
import { projectIdParamSchema } from '../projects/projects.routes';

const commonErrors = {
  400: errorResponseSchema,
  401: errorResponseSchema,
  403: errorResponseSchema,
  404: errorResponseSchema,
  409: errorResponseSchema,
  422: errorResponseSchema,
} as const;

const incidentParamsSchema = projectIdParamSchema.extend({
  incidentId: z.string().uuid(),
});

const linkParamsSchema = incidentParamsSchema.extend({
  linkId: z.string().uuid(),
});

const linkListSchema = z.object({ items: z.array(incidentLinkSchema) });

/** Request-scoped facts copied onto every audit row written by this module. */
function auditContext(request: {
  ip: string;
  headers: Record<string, string | string[] | undefined>;
}): { ip: string; userAgent: string | null } {
  const agent = request.headers['user-agent'];
  return { ip: request.ip, userAgent: typeof agent === 'string' ? agent : null };
}

export async function correlationRoutes(app: AppServer): Promise<void> {
  const service = createCorrelationService(app.db, app.events);

  app.post(
    '/projects/:projectId/incidents/:incidentId/correlation/run',
    {
      preHandler: [app.requireAuth, app.authorize('correlation:run')],
      schema: {
        params: incidentParamsSchema,
        querystring: rerunCorrelationSchema,
        response: { 200: correlationResultSchema, ...commonErrors },
      },
    },
    async (request) =>
      service.run(
        request.params.projectId,
        request.params.incidentId,
        request.query,
        request.auth!.userId,
        auditContext(request),
      ),
  );

  app.get(
    '/projects/:projectId/incidents/:incidentId/correlation',
    {
      preHandler: [app.requireAuth, app.authorize('correlation:read')],
      schema: {
        params: incidentParamsSchema,
        response: { 200: correlationResultSchema, ...commonErrors },
      },
    },
    async (request) => service.getSuggestions(request.params.projectId, request.params.incidentId),
  );

  app.get(
    '/projects/:projectId/incidents/:incidentId/links',
    {
      preHandler: [app.requireAuth, app.authorize('incident:read')],
      schema: {
        params: incidentParamsSchema,
        response: { 200: linkListSchema, ...commonErrors },
      },
    },
    async (request) => ({
      items: await service.listLinks(request.params.projectId, request.params.incidentId),
    }),
  );

  app.post(
    '/projects/:projectId/incidents/:incidentId/links',
    {
      preHandler: [app.requireAuth, app.authorize('incident:link')],
      schema: {
        params: incidentParamsSchema,
        body: linkIncidentSchema,
        response: { 201: incidentLinkSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      const link = await service.addManualLink(
        request.params.projectId,
        request.params.incidentId,
        request.body,
        request.auth!.userId,
        auditContext(request),
      );
      void reply
        .status(201)
        .header(
          'location',
          `/api/v1/projects/${request.params.projectId}/incidents/${request.params.incidentId}/links/${link.id}`,
        );
      return link;
    },
  );

  app.post(
    '/projects/:projectId/incidents/:incidentId/links/:linkId/decision',
    {
      preHandler: [app.requireAuth, app.authorize('incident:link')],
      schema: {
        params: linkParamsSchema,
        body: suggestionDecisionSchema,
        response: { 200: incidentLinkSchema, ...commonErrors },
      },
    },
    async (request) =>
      service.decide(
        request.params.projectId,
        request.params.incidentId,
        request.params.linkId,
        request.body,
        request.auth!.userId,
        auditContext(request),
      ),
  );
}
