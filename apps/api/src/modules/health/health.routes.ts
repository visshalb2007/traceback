import type { AppServer } from '../../types';
import type { HealthResponse } from './health.schemas';
import { healthResponseSchema } from './health.schemas';

const startedAt = Date.now();

/**
 * Liveness probe: always 200 while the process is up. The database check is
 * informational — a `down` database does not make the process unhealthy, it makes
 * it *not ready*, which the deployment platform's own readiness gate handles.
 */
export async function healthRoutes(app: AppServer): Promise<void> {
  app.get(
    '/health',
    { schema: { response: { 200: healthResponseSchema } } },
    async (): Promise<HealthResponse> => ({
      status: 'ok',
      service: 'traceback-api',
      version: process.env.npm_package_version ?? '0.1.0',
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      timestamp: new Date().toISOString(),
      checks: {
        database: await app.dbHealthcheck(),
      },
    }),
  );
}
