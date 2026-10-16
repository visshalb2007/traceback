import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { API, bearer, createProject, registerUser } from './helpers/api';
import { createTestHarness, hasTestDatabase, type TestHarness } from './helpers/harness';

describe.skipIf(!hasTestDatabase())('incidents (integration)', () => {
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

  async function setup(): Promise<{ projectId: string; token: string }> {
    const owner = await registerUser(harness.app);
    const project = await createProject(harness.app, owner.accessToken);
    return { projectId: project.id, token: owner.accessToken };
  }

  async function createIncident(
    projectId: string,
    token: string,
    payload: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    const response = await harness.app.inject({
      method: 'POST',
      url: `${API}/projects/${projectId}/incidents`,
      headers: bearer(token),
      payload: {
        title: 'Checkout latency spike',
        startedAt: new Date().toISOString(),
        ...payload,
      },
    });
    expect(response.statusCode).toBe(201);
    return response.json() as Record<string, unknown>;
  }

  it('creates an incident with an open status and a fingerprint', async () => {
    const { projectId, token } = await setup();
    const incident = await createIncident(projectId, token);

    expect(incident.status).toBe('open');
    expect(incident.severity).toBe('sev3');
    expect(typeof incident.fingerprint).toBe('string');
    expect((incident.fingerprint as string).length).toBeGreaterThan(0);
    expect(incident.rowVersion).toBe(1);
  });

  it('rejects an illegal status transition with a 422', async () => {
    const { projectId, token } = await setup();
    const incident = await createIncident(projectId, token);

    // open -> open is not a transition in the state machine.
    const response = await harness.app.inject({
      method: 'POST',
      url: `${API}/projects/${projectId}/incidents/${incident.id}/status`,
      headers: bearer(token),
      payload: { status: 'open' },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe('INVALID_TRANSITION');
  });

  it('walks the state machine through investigating -> mitigated -> resolved', async () => {
    const { projectId, token } = await setup();
    const incident = await createIncident(projectId, token);

    for (const status of ['investigating', 'mitigated', 'resolved']) {
      const response = await harness.app.inject({
        method: 'POST',
        url: `${API}/projects/${projectId}/incidents/${incident.id}/status`,
        headers: bearer(token),
        payload: { status },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().status).toBe(status);
    }

    const resolved = await harness.app.inject({
      method: 'GET',
      url: `${API}/projects/${projectId}/incidents/${incident.id}`,
      headers: bearer(token),
    });
    expect(resolved.json().resolvedAt).not.toBeNull();
  });

  it('returns 409 when a status change carries a stale rowVersion', async () => {
    const { projectId, token } = await setup();
    const incident = await createIncident(projectId, token);

    const response = await harness.app.inject({
      method: 'POST',
      url: `${API}/projects/${projectId}/incidents/${incident.id}/status`,
      headers: bearer(token),
      payload: { status: 'investigating', expectedRowVersion: 0 },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('VERSION_CONFLICT');
  });

  it('appends comments without mutating the incident rowVersion', async () => {
    const { projectId, token } = await setup();
    const incident = await createIncident(projectId, token);

    const first = await harness.app.inject({
      method: 'POST',
      url: `${API}/projects/${projectId}/incidents/${incident.id}/updates`,
      headers: bearer(token),
      payload: { body: 'Looking into it' },
    });
    expect(first.statusCode).toBe(201);
    expect(first.json().kind).toBe('comment');

    const second = await harness.app.inject({
      method: 'POST',
      url: `${API}/projects/${projectId}/incidents/${incident.id}/updates`,
      headers: bearer(token),
      payload: { body: 'Rolled back the deploy', kind: 'resolution_note' },
    });
    expect(second.statusCode).toBe(201);

    const list = await harness.app.inject({
      method: 'GET',
      url: `${API}/projects/${projectId}/incidents/${incident.id}/updates`,
      headers: bearer(token),
    });
    expect(list.json().items).toHaveLength(2);

    const reloaded = await harness.app.inject({
      method: 'GET',
      url: `${API}/projects/${projectId}/incidents/${incident.id}`,
      headers: bearer(token),
    });
    expect(reloaded.json().rowVersion).toBe(1);
  });

  it('groups incidents that share a fingerprint as recurring', async () => {
    const { projectId, token } = await setup();
    await createIncident(projectId, token, {
      service: 'checkout',
      errorSignature: 'timeout after 1000ms (req ab12)',
    });
    // A different request id in the signature must not defeat the fingerprint.
    await createIncident(projectId, token, {
      service: 'checkout',
      errorSignature: 'timeout after 3000ms (req 9f2c)',
    });

    const recurring = await harness.app.inject({
      method: 'GET',
      url: `${API}/projects/${projectId}/incidents/recurring`,
      headers: bearer(token),
    });

    expect(recurring.statusCode).toBe(200);
    const groups = recurring.json().items as Array<{ count: number; incidentIds: string[] }>;
    expect(groups).toHaveLength(1);
    expect(groups[0]?.count).toBe(2);
    expect(groups[0]?.incidentIds).toHaveLength(2);
  });
});
