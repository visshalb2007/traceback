import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app';
import { loadEnv } from '../env';

describe('health endpoint', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ env: loadEnv({ NODE_ENV: 'test' } as NodeJS.ProcessEnv) });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports ok with a skipped database check', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe('ok');
    expect(body.service).toBe('traceback-api');
    expect(body.checks.database).toBe('skipped');
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
