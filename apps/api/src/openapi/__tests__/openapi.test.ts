import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app';
import { loadEnv } from '../../env';

/**
 * The document is generated from the route schemas, so this asserts that the
 * wiring produces a real OpenAPI object (and stays reachable without Postgres).
 */
describe('openapi document', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({
      env: loadEnv({
        NODE_ENV: 'test',
        DATABASE_URL: 'postgres://traceback:traceback@localhost:59999/traceback',
      } as NodeJS.ProcessEnv),
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves an OpenAPI 3 document covering the versioned API', async () => {
    const response = await app.inject({ method: 'GET', url: '/openapi.json' });

    expect(response.statusCode).toBe(200);
    const document = response.json();
    expect(document.openapi).toMatch(/^3\./);
    expect(document.info.title).toBe('TraceBack API');
    expect(document.components.securitySchemes.bearerAuth.scheme).toBe('bearer');

    const paths = Object.keys(document.paths);
    expect(paths).toContain('/health');
    expect(paths).toContain('/api/v1/projects');
    expect(paths).toContain('/api/v1/projects/{projectId}/incidents');
    expect(paths).toContain('/api/v1/projects/{projectId}/deployments');
  });

  it('keeps the JSON route out of the document', async () => {
    const document = (await app.inject({ method: 'GET', url: '/openapi.json' })).json();
    expect(Object.keys(document.paths)).not.toContain('/openapi.json');
  });
});
