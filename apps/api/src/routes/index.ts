import type { AppServer } from '../types';
import { healthRoutes } from '../modules/health/health.routes';

/**
 * Every module exposes an async plugin so app.ts stays a flat, readable list of
 * `register` calls. Later commits append their routes here.
 */
export async function registerRoutes(app: AppServer): Promise<void> {
  await app.register(healthRoutes);
}
