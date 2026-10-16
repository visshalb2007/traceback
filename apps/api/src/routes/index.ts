import type { AppServer } from '../types';
import { auditRoutes } from '../modules/audit/audit.routes';
import { authRoutes } from '../modules/auth/auth.routes';
import { changesRoutes } from '../modules/changes/changes.routes';
import { deploymentsRoutes } from '../modules/deployments/deployments.routes';
import { healthRoutes } from '../modules/health/health.routes';
import { incidentsRoutes } from '../modules/incidents/incidents.routes';
import { membersRoutes } from '../modules/members/members.routes';
import { projectsRoutes } from '../modules/projects/projects.routes';
import { timelineRoutes } from '../modules/timeline/timeline.routes';

/**
 * Every module exposes an async plugin so app.ts stays a flat, readable list of
 * `register` calls. Later commits append their routes here.
 */
export async function registerRoutes(app: AppServer): Promise<void> {
  await app.register(healthRoutes);

  await app.register(
    async (api) => {
      await api.register(authRoutes);
      await api.register(projectsRoutes);
      await api.register(membersRoutes);
      await api.register(deploymentsRoutes);
      await api.register(changesRoutes);
      await api.register(incidentsRoutes);
      await api.register(auditRoutes);
      await api.register(timelineRoutes);
    },
    { prefix: '/api/v1' },
  );
}
