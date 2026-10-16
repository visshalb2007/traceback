import type { AppServer } from '../../types';
import type { HealthResponse } from './health.schemas';
import { healthResponseSchema } from './health.schemas';

const startedAt = Date.now();

/**
 * Liveness probe. The database check is wired in by the db plugin (see commit 8)
 * via `app.dbHealthcheck` and reports 'skipped' while no database is attached,
 * which keeps the scaffold and its tests runnable without Postgres.
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
        database: app.dbHealthcheck ? await app.dbHealthcheck() : 'skipped',
      },
    }),
  );
}
