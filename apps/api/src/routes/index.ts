import type { AppServer } from '../types';
import { auditRoutes } from '../modules/audit/audit.routes';
import { apiKeysRoutes } from '../modules/apikeys/apikeys.routes';
import { authRoutes } from '../modules/auth/auth.routes';
import { changesRoutes } from '../modules/changes/changes.routes';
import { correlationRoutes } from '../modules/correlation/correlation.routes';
import { dashboardRoutes } from '../modules/dashboard/dashboard.routes';
import { deploymentsRoutes } from '../modules/deployments/deployments.routes';
import { healthRoutes } from '../modules/health/health.routes';
import { incidentsRoutes } from '../modules/incidents/incidents.routes';
import { membersRoutes } from '../modules/members/members.routes';
import { projectsRoutes } from '../modules/projects/projects.routes';
import { realtimeRoutes } from '../modules/realtime/realtime.routes';
import { timelineRoutes } from '../modules/timeline/timeline.routes';
import { webhookIngestRoutes } from '../modules/webhooks/webhooks.ingest.routes';
import { webhooksRoutes } from '../modules/webhooks/webhooks.routes';

/**
 * Every module exposes an async plugin so app.ts stays a flat, readable list of
 * `register` calls. Later commits append their routes here.
 */
export async function registerRoutes(app: AppServer): Promise<void> {
  await app.register(healthRoutes);

  // Public provider callbacks live outside the versioned API surface.
  await app.register(webhookIngestRoutes);

  await app.register(
    async (api) => {
      await api.register(authRoutes);
      await api.register(projectsRoutes);
      await api.register(membersRoutes);
      await api.register(deploymentsRoutes);
      await api.register(changesRoutes);
      await api.register(incidentsRoutes);
      await api.register(correlationRoutes);
      await api.register(dashboardRoutes);
      await api.register(auditRoutes);
      await api.register(timelineRoutes);
      await api.register(realtimeRoutes);
      await api.register(webhooksRoutes);
      await api.register(apiKeysRoutes);
    },
    { prefix: '/api/v1' },
  );
}
