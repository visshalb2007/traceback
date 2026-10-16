import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';
import type { AppServer } from '../types';

/**
 * OpenAPI is derived, never hand-written: `jsonSchemaTransform` converts the Zod
 * schemas that already validate and serialise every route into JSON Schema, so the
 * document cannot drift from the implementation.
 *
 * Registered before `registerRoutes` so the plugin observes every route.
 */
export async function registerOpenApi(app: AppServer): Promise<void> {
  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'TraceBack API',
        version: '0.1.0',
        description:
          'Incident tracking and deployment monitoring. Events are append-only and ordered by occurred_at; duplicate deliveries are acknowledged with 200 and an X-Idempotent-Replay header.',
      },
      servers: [{ url: 'http://localhost:4000', description: 'Local development' }],
      tags: [
        { name: 'auth', description: 'Registration, login and token rotation' },
        { name: 'projects', description: 'Projects and membership' },
        { name: 'deployments', description: 'Deployment records and enrichment' },
        { name: 'changes', description: 'Commits, pull requests and merges' },
        { name: 'incidents', description: 'Incidents, status machine and comments' },
        { name: 'correlation', description: 'Ranked suspect suggestions' },
        { name: 'timeline', description: 'The unified, ordered event timeline' },
        { name: 'dashboard', description: 'Aggregate metrics' },
        { name: 'audit', description: 'Immutable audit log' },
        { name: 'webhooks', description: 'Provider webhook endpoints' },
        { name: 'api-keys', description: 'Project-scoped API keys' },
        { name: 'realtime', description: 'Server-sent event stream' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description:
              'A JWT access token from /auth/login, or a project-scoped API key (`tbk_…`).',
          },
        },
      },
    },
    transform: jsonSchemaTransform,
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true },
  });

  // A stable, conventional URL for tooling; excluded from the document itself.
  app.get('/openapi.json', { schema: { hide: true } }, async () => app.swagger());
}
