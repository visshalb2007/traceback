import { z } from 'zod';
import { auditLogSchema, auditQuerySchema, errorResponseSchema } from '@traceback/shared';
import type { AppServer } from '../../types';
import { createAuditService } from './audit.service';
import { projectIdParamSchema } from '../projects/projects.routes';

const commonErrors = {
  400: errorResponseSchema,
  401: errorResponseSchema,
  403: errorResponseSchema,
  404: errorResponseSchema,
} as const;

const auditListSchema = z.object({
  items: z.array(auditLogSchema),
  nextCursor: z.string().nullable(),
});

export async function auditRoutes(app: AppServer): Promise<void> {
  const service = createAuditService(app.db);

  app.get(
    '/projects/:projectId/audit-logs',
    {
      preHandler: [app.requireAuth, app.authorize('audit:read')],
      schema: {
        params: projectIdParamSchema,
        querystring: auditQuerySchema,
        response: { 200: auditListSchema, ...commonErrors },
      },
    },
    async (request) =>
      service.list(request.params.projectId, {
        action: request.query.action,
        entityType: request.query.entityType,
        entityId: request.query.entityId,
        actorId: request.query.actorId,
        from: request.query.from ? new Date(request.query.from) : undefined,
        to: request.query.to ? new Date(request.query.to) : undefined,
        limit: request.query.limit,
        cursor: request.query.cursor,
      }),
  );
}
