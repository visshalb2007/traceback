import {
  dashboardMetricsSchema,
  dashboardQuerySchema,
  errorResponseSchema,
} from '@traceback/shared';
import type { AppServer } from '../../types';
import { createDashboardService } from './dashboard.service';
import { projectIdParamSchema } from '../projects/projects.routes';

const commonErrors = {
  400: errorResponseSchema,
  401: errorResponseSchema,
  403: errorResponseSchema,
  404: errorResponseSchema,
} as const;

export async function dashboardRoutes(app: AppServer): Promise<void> {
  const service = createDashboardService(app.db);

  app.get(
    '/projects/:projectId/dashboard',
    {
      preHandler: [app.requireAuth, app.authorize('dashboard:read')],
      schema: {
        params: projectIdParamSchema,
        querystring: dashboardQuerySchema,
        response: { 200: dashboardMetricsSchema, ...commonErrors },
      },
    },
    async (request) => service.getMetrics(request.params.projectId, request.query),
  );
}
