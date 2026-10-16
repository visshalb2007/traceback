import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app';
import { loadEnv } from '../env';

describe('health endpoint', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({
      env: loadEnv({
        NODE_ENV: 'test',
        // Point at a port nothing listens on so the check is deterministic.
        DATABASE_URL: 'postgres://traceback:traceback@localhost:59999/traceback',
      } as NodeJS.ProcessEnv),
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports ok and includes a database check', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe('ok');
    expect(body.service).toBe('traceback-api');
    expect(['up', 'down']).toContain(body.checks.database);
  });

  it('reports the database as down when Postgres is unreachable', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.json().checks.database).toBe('down');
  });

  it('returns the canonical error envelope for unknown routes', async () => {
    const response = await app.inject({ method: 'GET', url: '/does-not-exist' });

    expect(response.statusCode).toBe(404);
    const body = response.json();
    expect(body.error.code).toBe('NOT_FOUND');
    expect(typeof body.error.message).toBe('string');
  });

  it('echoes a caller supplied request id', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-request-id': 'req_test_123' },
    });
    expect(response.headers['x-request-id']).toBe('req_test_123');
  });
});
