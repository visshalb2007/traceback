import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { API, bearer, createProject, registerUser } from './helpers/api';
import { createTestHarness, hasTestDatabase, type TestHarness } from './helpers/harness';

describe.skipIf(!hasTestDatabase())('deployments and the event store (integration)', () => {
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

  it('records an incomplete deployment and reports its completeness', async () => {
    const owner = await registerUser(harness.app);
    const project = await createProject(harness.app, owner.accessToken);

    const response = await harness.app.inject({
      method: 'POST',
      url: `${API}/projects/${project.id}/deployments`,
      headers: bearer(owner.accessToken),
      payload: { service: 'payments-api', environment: 'production', status: 'in_progress' },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.service).toBe('payments-api');
    expect(body.finishedAt).toBeNull();
    expect(body.commitSha).toBeNull();
    // Nothing but a terminal-ish status is known, so the score stays low.
    expect(body.completeness.score).toBeLessThan(1);
    expect(body.completeness.hasCommit).toBe(false);
  });

  it('replays a duplicate submission and flags it instead of double-recording', async () => {
    const owner = await registerUser(harness.app);
    const project = await createProject(harness.app, owner.accessToken);
    const payload = {
      service: 'payments-api',
      environment: 'production',
      status: 'success',
      idempotencyKey: 'deploy-2026-01-01-1',
    };

    const first = await harness.app.inject({
      method: 'POST',
      url: `${API}/projects/${project.id}/deployments`,
      headers: bearer(owner.accessToken),
      payload,
    });
    expect(first.statusCode).toBe(201);
    expect(first.headers['x-idempotent-replay']).toBeUndefined();

    const second = await harness.app.inject({
      method: 'POST',
      url: `${API}/projects/${project.id}/deployments`,
      headers: bearer(owner.accessToken),
      payload,
    });
    expect(second.statusCode).toBe(200);
    expect(second.headers['x-idempotent-replay']).toBe('true');
    expect(second.json().id).toBe(first.json().id);

    const list = await harness.app.inject({
      method: 'GET',
      url: `${API}/projects/${project.id}/deployments`,
      headers: bearer(owner.accessToken),
    });
    expect(list.json().items).toHaveLength(1);
  });

  it('enriches a deployment to a complete record', async () => {
    const owner = await registerUser(harness.app);
    const project = await createProject(harness.app, owner.accessToken);

    const created = await harness.app.inject({
      method: 'POST',
      url: `${API}/projects/${project.id}/deployments`,
      headers: bearer(owner.accessToken),
      payload: { service: 'api', environment: 'staging' },
    });
    const deploymentId = created.json().id as string;

    const enriched = await harness.app.inject({
      method: 'PATCH',
      url: `${API}/projects/${project.id}/deployments/${deploymentId}`,
      headers: bearer(owner.accessToken),
      payload: {
        status: 'success',
        commitSha: 'abc1234',
        authorEmail: 'dev@example.com',
        finishedAt: new Date().toISOString(),
      },
    });

    expect(enriched.statusCode).toBe(200);
    const body = enriched.json();
    expect(body.completeness.score).toBe(1);
    expect(body.completeness.hasCommit).toBe(true);
    expect(body.rowVersion).toBeGreaterThan(created.json().rowVersion);
  });

  it('flags a backdated event as late on the timeline', async () => {
    const owner = await registerUser(harness.app);
    const project = await createProject(harness.app, owner.accessToken);

    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await harness.app.inject({
      method: 'POST',
      url: `${API}/projects/${project.id}/deployments`,
      headers: bearer(owner.accessToken),
      payload: {
        service: 'api',
        environment: 'production',
        status: 'success',
        occurredAt: tenMinutesAgo,
      },
    });

    const timeline = await harness.app.inject({
      method: 'GET',
      url: `${API}/projects/${project.id}/timeline?type=deployment.recorded`,
      headers: bearer(owner.accessToken),
    });

    expect(timeline.statusCode).toBe(200);
    const items = timeline.json().items as Array<{ type: string; isLate: boolean }>;
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]?.type).toBe('deployment.recorded');
    expect(items[0]?.isLate).toBe(true);
  });
});
