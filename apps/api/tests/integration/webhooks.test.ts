import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { API, bearer, createProject, registerUser } from './helpers/api';
import { createTestHarness, hasTestDatabase, type TestHarness } from './helpers/harness';

const SECRET = 'a-very-secret-webhook-signing-key';
const INGEST = '/webhooks/github';

/** Recompute the signature with node:crypto so the test verifies, not mirrors, the impl. */
const sign = (body: string): string =>
  `sha256=${createHmac('sha256', SECRET).update(Buffer.from(body, 'utf8')).digest('hex')}`;

const pushBody = (sha: string): string =>
  JSON.stringify({
    ref: 'refs/heads/main',
    repository: { name: 'checkout-api' },
    head_commit: {
      id: sha,
      message: 'Fix the flaky checkout test',
      timestamp: new Date().toISOString(),
      url: `https://github.com/acme/checkout-api/commit/${sha}`,
      added: [],
      modified: ['src/checkout.ts'],
      removed: [],
      author: { name: 'Ada', email: 'ada@example.com' },
    },
  });

describe.skipIf(!hasTestDatabase())('webhooks (integration)', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness();
  });

  afterAll(async () => {
    await harness?.close();
  });

  beforeEach(async () => {
    await harness.truncateAll();
  });

  async function setup(): Promise<{ projectId: string; token: string; endpointId: string }> {
    const owner = await registerUser(harness.app);
    const project = await createProject(harness.app, owner.accessToken);
    const endpoint = await harness.app.inject({
      method: 'POST',
      url: `${API}/projects/${project.id}/webhooks`,
      headers: bearer(owner.accessToken),
      payload: { name: 'GitHub', secret: SECRET },
    });
    expect(endpoint.statusCode).toBe(201);
    return {
      projectId: project.id,
      token: owner.accessToken,
      endpointId: (endpoint.json() as { id: string }).id,
    };
  }

  function deliver(endpointId: string, body: string, headers: Record<string, string> = {}) {
    return harness.app.inject({
      method: 'POST',
      url: `${INGEST}/${endpointId}`,
      headers: {
        'content-type': 'application/json',
        'x-github-event': 'push',
        'x-github-delivery': `delivery-${Math.random().toString(36).slice(2)}`,
        ...headers,
      },
      payload: body,
    });
  }

  it('rejects an unsigned delivery with 401', async () => {
    const { endpointId } = await setup();
    const response = await deliver(endpointId, pushBody('a'.repeat(40)));
    expect(response.statusCode).toBe(401);
  });

  it('rejects a delivery whose signature does not match the body', async () => {
    const { endpointId } = await setup();
    const body = pushBody('b'.repeat(40));
    const response = await deliver(endpointId, body, {
      'x-hub-signature-256': `sha256=${'0'.repeat(64)}`,
    });
    expect(response.statusCode).toBe(401);
  });

  it('accepts a signed push, records a change and dedupes the delivery id', async () => {
    const { projectId, token, endpointId } = await setup();
    const body = pushBody('c'.repeat(40));
    const signature = sign(body);

    const first = await deliver(endpointId, body, {
      'x-hub-signature-256': signature,
      'x-github-delivery': 'delivery-1',
    });
    expect(first.statusCode).toBe(202);
    expect(first.json().status).toBe('processed');
    expect(first.json().duplicate).toBe(false);

    // The same delivery id replays as a duplicate instead of double-writing.
    const replay = await deliver(endpointId, body, {
      'x-hub-signature-256': signature,
      'x-github-delivery': 'delivery-1',
    });
    expect(replay.statusCode).toBe(202);
    expect(replay.headers['x-webhook-duplicate']).toBe('true');
    expect(replay.json().duplicate).toBe(true);

    const deliveries = await harness.app.inject({
      method: 'GET',
      url: `${API}/projects/${projectId}/webhooks/deliveries`,
      headers: bearer(token),
    });
    expect(deliveries.statusCode).toBe(200);
    expect(deliveries.json().items).toHaveLength(1);
    expect(deliveries.json().items[0].status).toBe('processed');

    const changes = await harness.app.inject({
      method: 'GET',
      url: `${API}/projects/${projectId}/changes`,
      headers: bearer(token),
    });
    expect(changes.statusCode).toBe(200);
    expect(changes.json().items).toHaveLength(1);
  });

  it('acknowledges a ping as processed without touching the domain', async () => {
    const { projectId, token, endpointId } = await setup();
    const body = JSON.stringify({ zen: 'Non-blocking is better than blocking.' });

    const response = await deliver(endpointId, body, {
      'content-type': 'application/json',
      'x-github-event': 'ping',
      'x-hub-signature-256': sign(body),
    });
    expect(response.statusCode).toBe(202);
    expect(response.json().status).toBe('processed');

    const changes = await harness.app.inject({
      method: 'GET',
      url: `${API}/projects/${projectId}/changes`,
      headers: bearer(token),
    });
    expect(changes.json().items).toHaveLength(0);
  });
});
