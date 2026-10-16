import { z } from 'zod';
import {
  createWebhookEndpointSchema,
  errorResponseSchema,
  updateWebhookEndpointSchema,
  webhookDeliverySchema,
  webhookEndpointSchema,
} from '@traceback/shared';
import type { AppServer } from '../../types';
import { createWebhooksService } from './webhooks.service';
import { projectIdParamSchema } from '../projects/projects.routes';

const commonErrors = {
  400: errorResponseSchema,
  401: errorResponseSchema,
  403: errorResponseSchema,
  404: errorResponseSchema,
} as const;

const endpointParamsSchema = projectIdParamSchema.extend({
  webhookId: z.string().uuid(),
});

const endpointListSchema = z.object({ items: z.array(webhookEndpointSchema) });
const deliveryListSchema = z.object({
  items: z.array(webhookDeliverySchema),
  nextCursor: z.string().nullable(),
});

const deliveryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/** Request-scoped facts copied onto every audit row written by this module. */
function auditContext(request: {
  ip: string;
  headers: Record<string, string | string[] | undefined>;
}): { ip: string; userAgent: string | null } {
  const agent = request.headers['user-agent'];
  return { ip: request.ip, userAgent: typeof agent === 'string' ? agent : null };
}

export async function webhooksRoutes(app: AppServer): Promise<void> {
  const service = createWebhooksService(app.db);

  app.get(
    '/projects/:projectId/webhooks',
    {
      preHandler: [app.requireAuth, app.authorize('webhook:manage')],
      schema: {
        params: projectIdParamSchema,
        response: { 200: endpointListSchema, ...commonErrors },
      },
    },
    async (request) => ({ items: await service.listEndpoints(request.params.projectId) }),
  );

  app.post(
    '/projects/:projectId/webhooks',
    {
      preHandler: [app.requireAuth, app.authorize('webhook:manage')],
      schema: {
        params: projectIdParamSchema,
        body: createWebhookEndpointSchema,
        response: { 201: webhookEndpointSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      const endpoint = await service.createEndpoint(
        request.params.projectId,
        request.body,
        request.auth!.userId,
        auditContext(request),
      );
      void reply
        .status(201)
        .header('location', `/api/v1/projects/${request.params.projectId}/webhooks/${endpoint.id}`);
      return endpoint;
    },
  );

  app.patch(
    '/projects/:projectId/webhooks/:webhookId',
    {
      preHandler: [app.requireAuth, app.authorize('webhook:manage')],
      schema: {
        params: endpointParamsSchema,
        body: updateWebhookEndpointSchema,
        response: { 200: webhookEndpointSchema, ...commonErrors },
      },
    },
    async (request) =>
      service.updateEndpoint(
        request.params.projectId,
        request.params.webhookId,
        request.body,
        request.auth!.userId,
        auditContext(request),
      ),
  );

  app.delete(
    '/projects/:projectId/webhooks/:webhookId',
    {
      preHandler: [app.requireAuth, app.authorize('webhook:manage')],
      schema: { params: endpointParamsSchema, response: { 204: z.null(), ...commonErrors } },
    },
    async (request, reply) => {
      await service.deleteEndpoint(
        request.params.projectId,
        request.params.webhookId,
        request.auth!.userId,
        auditContext(request),
      );
      return reply.status(204).send(null);
    },
  );

  app.get(
    '/projects/:projectId/webhooks/deliveries',
    {
      preHandler: [app.requireAuth, app.authorize('webhook:manage')],
      schema: {
        params: projectIdParamSchema,
        querystring: deliveryQuerySchema,
        response: { 200: deliveryListSchema, ...commonErrors },
      },
    },
    async (request) => ({
      items: await service.listDeliveries(request.params.projectId, request.query.limit),
      nextCursor: null,
    }),
  );
}
