import 'dotenv/config';
import { createDbClient } from './client';
import { loadEnv } from '../env';
import { createEventsService } from '../modules/events/events.service';
import { createAuthService } from '../modules/auth/auth.service';
import { createProjectsService } from '../modules/projects/projects.service';
import { createChangesService } from '../modules/changes/changes.service';
import { createDeploymentsService } from '../modules/deployments/deployments.service';
import { createIncidentsService } from '../modules/incidents/incidents.service';
import { createCorrelationService } from '../modules/correlation/correlation.service';

/**
 * Seeds a demo project so `docker compose up` gives you something to click on.
 * Idempotent: running it twice logs in instead of re-registering, and skips the
 * data seeding if the project already exists.
 *
 *   pnpm --filter @traceback/api db:seed
 */
const DEMO_EMAIL = 'demo@traceback.dev';
const DEMO_PASSWORD = 'DemoPassword123!';
const DEMO_NAME = 'Demo Engineer';
const PROJECT_SLUG = 'checkout-platform';

const minutesAgo = (minutes: number): string =>
  new Date(Date.now() - minutes * 60_000).toISOString();

async function main(): Promise<void> {
  const env = loadEnv();
  const handle = createDbClient(env.DATABASE_URL, { maxConnections: 2 });

  try {
    const events = createEventsService(handle.db, env.LATE_EVENT_THRESHOLD_MS);
    const auth = createAuthService(handle.db, env);
    const projects = createProjectsService(handle.db, events);
    const changes = createChangesService(handle.db, events);
    const deployments = createDeploymentsService(handle.db, events);
    const incidents = createIncidentsService(handle.db, events);
    const correlation = createCorrelationService(handle.db, events);

    const tokens = await auth
      .register({ email: DEMO_EMAIL, name: DEMO_NAME, password: DEMO_PASSWORD })
      .catch(() => auth.login({ email: DEMO_EMAIL, password: DEMO_PASSWORD }));

    const userId = tokens.user.id;
    const existing = (await projects.list(userId)).find((p) => p.slug === PROJECT_SLUG);

    if (existing) {
      console.log(`Demo project already exists (${existing.id}); nothing to do.`);
      console.log(`Sign in as ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
      return;
    }

    const project = await projects.create(
      {
        name: 'Checkout Platform',
        slug: PROJECT_SLUG,
        description: 'Demo project seeded for local exploration.',
        repositoryUrl: 'https://github.com/traceback-demo/checkout-platform',
      },
      userId,
    );
    const projectId = project.id;

    // A calm baseline: a couple of healthy deploys over the last day.
    for (const [version, sha, minutes] of [
      ['v2.3.0', 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2', 1_400],
      ['v2.3.1', 'b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3', 700],
    ] as const) {
      await deployments.record(
        projectId,
        {
          service: 'checkout-api',
          environment: 'production',
          status: 'success',
          version,
          commitSha: sha,
          commitMessage: `Release ${version}`,
          branch: 'main',
          authorEmail: 'ada@traceback.dev',
          authorName: 'Ada Lovelace',
          startedAt: minutesAgo(minutes + 4),
          finishedAt: minutesAgo(minutes),
          occurredAt: minutesAgo(minutes),
        },
        userId,
      );
    }

    // The suspect: a failed production deploy minutes before the incident.
    await deployments.record(
      projectId,
      {
        service: 'checkout-api',
        environment: 'production',
        status: 'failed',
        version: 'v2.4.0',
        commitSha: 'c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
        commitMessage: 'Refactor checkout retry logic',
        branch: 'main',
        authorEmail: 'grace@traceback.dev',
        authorName: 'Grace Hopper',
        startedAt: minutesAgo(40),
        finishedAt: minutesAgo(36),
        occurredAt: minutesAgo(36),
      },
      userId,
    );

    await changes.record(
      projectId,
      {
        type: 'commit',
        sha: 'c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
        title: 'Refactor checkout retry logic',
        message: 'Move the retry policy out of the handler and add jitter.',
        authorEmail: 'grace@traceback.dev',
        authorName: 'Grace Hopper',
        branch: 'main',
        filesChanged: ['src/checkout/retry.ts', 'src/checkout/handler.ts'],
        services: ['checkout-api'],
        occurredAt: minutesAgo(45),
      },
      userId,
    );

    const incident = await incidents.create(
      projectId,
      {
        title: 'Checkout requests timing out',
        description: 'p99 latency above 10s and a rising timeout rate on the payment call.',
        severity: 'sev2',
        status: 'open',
        service: 'checkout-api',
        environment: 'production',
        errorSignature: 'ETIMEDOUT connecting to payments-gateway',
        affectedComponents: ['checkout-api', 'src/checkout/retry.ts'],
        startedAt: minutesAgo(30),
      },
      userId,
    );

    await incidents.changeStatus(
      projectId,
      incident.id,
      { status: 'investigating', note: 'Paging the on-call and opening the dashboards.' },
      userId,
    );

    await incidents.addComment(
      projectId,
      incident.id,
      { body: 'Looks like it lines up with the v2.4.0 deploy — rolling it back.', kind: 'comment' },
      userId,
    );

    await incidents.changeStatus(
      projectId,
      incident.id,
      { status: 'mitigated', note: 'Rolled back to v2.3.1; error rate is falling.' },
      userId,
    );

    // A resolved low-severity incident, so the dashboard has history.
    const resolved = await incidents.create(
      projectId,
      {
        title: 'Elevated 500s on the orders endpoint',
        severity: 'sev4',
        status: 'open',
        service: 'orders-api',
        environment: 'production',
        errorSignature: 'NullPointerException in OrderMapper',
        affectedComponents: ['orders-api'],
        startedAt: minutesAgo(2_000),
      },
      userId,
    );
    await incidents.changeStatus(projectId, resolved.id, { status: 'resolved' }, userId);

    const suggestions = await correlation.run(
      projectId,
      incident.id,
      { lookbackHours: 72, minScore: 0.25, limit: 5 },
      userId,
    );

    console.log('Seed complete.');
    console.log(`  Project:   ${project.name} (${projectId})`);
    console.log(`  Incident:  ${incident.title} (${incident.id})`);
    console.log(`  Suggested: ${suggestions.candidates.length} candidate(s)`);
    console.log(`  Sign in:   ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  } finally {
    await handle.close();
  }
}

main().catch((error: unknown) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
