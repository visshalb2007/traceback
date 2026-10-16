import { z } from 'zod';
import { errorResponseSchema, timelineItemSchema, timelineQuerySchema } from '@traceback/shared';
import type { AppServer } from '../../types';
import { createTimelineService } from './timeline.service';
import { projectIdParamSchema } from '../projects/projects.routes';

const commonErrors = {
  400: errorResponseSchema,
  401: errorResponseSchema,
  403: errorResponseSchema,
  404: errorResponseSchema,
} as const;

const timelineListSchema = z.object({
  items: z.array(timelineItemSchema),
  nextCursor: z.string().nullable(),
});

export async function timelineRoutes(app: AppServer): Promise<void> {
  const service = createTimelineService(app.db);

  app.get(
    '/projects/:projectId/timeline',
    {
      preHandler: [app.requireAuth, app.authorize('timeline:read')],
      schema: {
        params: projectIdParamSchema,
        querystring: timelineQuerySchema,
        response: { 200: timelineListSchema, ...commonErrors },
      },
    },
    async (request) =>
      service.list(request.params.projectId, {
        types: request.query.type,
        entityType: request.query.entityType,
        entityId: request.query.entityId,
        actorId: request.query.actorId,
        environment: request.query.environment,
        source: request.query.source,
        isLate: request.query.isLate,
        from: request.query.from ? new Date(request.query.from) : undefined,
        to: request.query.to ? new Date(request.query.to) : undefined,
        order: request.query.order,
        limit: request.query.limit,
        cursor: request.query.cursor,
      }),
  );
}
