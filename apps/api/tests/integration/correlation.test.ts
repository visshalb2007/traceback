import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { API, bearer, createProject, registerUser } from './helpers/api';
import { createTestHarness, hasTestDatabase, type TestHarness } from './helpers/harness';

describe.skipIf(!hasTestDatabase())('correlation (integration)', () => {
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

  /** A project with a production deploy of `checkout` minutes before an incident. */
  async function scenario(): Promise<{
    projectId: string;
    token: string;
    deploymentId: string;
    incidentId: string;
  }> {
    const owner = await registerUser(harness.app);
    const project = await createProject(harness.app, owner.accessToken);
    const token = owner.accessToken;

    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const deployment = await harness.app.inject({
      method: 'POST',
      url: `${API}/projects/${project.id}/deployments`,
      headers: bearer(token),
      payload: {
        service: 'checkout',
        environment: 'production',
        status: 'success',
        version: 'v1.4.2',
        commitSha: 'abc1234',
        authorEmail: 'dev@example.com',
        authorName: 'Dev',
        startedAt: twoMinutesAgo,
        finishedAt: new Date(Date.now() - 60 * 1000).toISOString(),
      },
    });
    expect(deployment.statusCode).toBe(201);

    const incident = await harness.app.inject({
      method: 'POST',
      url: `${API}/projects/${project.id}/incidents`,
      headers: bearer(token),
      payload: {
        title: 'Checkout is failing',
        service: 'checkout',
        environment: 'production',
        severity: 'sev1',
        startedAt: new Date().toISOString(),
      },
    });
    expect(incident.statusCode).toBe(201);

    return {
      projectId: project.id,
      token,
      deploymentId: deployment.json().id as string,
      incidentId: incident.json().id as string,
    };
  }

  it('ranks the recent matching deployment as a suspect with reasons', async () => {
    const { projectId, token, incidentId, deploymentId } = await scenario();

    const run = await harness.app.inject({
      method: 'POST',
      url: `${API}/projects/${projectId}/incidents/${incidentId}/correlation/run`,
      headers: bearer(token),
    });

    expect(run.statusCode).toBe(200);
    const result = run.json() as {
      algorithmVersion: string;
      candidates: Array<{ entityType: string; entityId: string; score: number; reasons: string[] }>;
    };

    expect(result.algorithmVersion).toBeTruthy();
    expect(result.candidates.length).toBeGreaterThan(0);

    const suspect = result.candidates.find((candidate) => candidate.entityId === deploymentId);
    expect(suspect).toBeDefined();
    expect(suspect?.entityType).toBe('deployment');
    expect(suspect?.score).toBeGreaterThan(0);
    expect(suspect?.reasons.length ?? 0).toBeGreaterThan(0);
  });

  it('persists a suggestion that can be confirmed, and never clobbers it on a re-run', async () => {
    const { projectId, token, incidentId } = await scenario();

    await harness.app.inject({
      method: 'POST',
      url: `${API}/projects/${projectId}/incidents/${incidentId}/correlation/run`,
      headers: bearer(token),
    });

    const links = await harness.app.inject({
      method: 'GET',
      url: `${API}/projects/${projectId}/incidents/${incidentId}/links`,
      headers: bearer(token),
    });
    const suggested = (links.json().items as Array<{ id: string; status: string }>).find(
      (link) => link.status === 'suggested',
    );
    expect(suggested).toBeDefined();

    const confirm = await harness.app.inject({
      method: 'POST',
      url: `${API}/projects/${projectId}/incidents/${incidentId}/links/${suggested?.id}/decision`,
      headers: bearer(token),
      payload: { decision: 'confirm' },
    });
    expect(confirm.statusCode).toBe(200);
    expect(confirm.json().status).toBe('confirmed');

    // A re-run must leave the human decision untouched.
    await harness.app.inject({
      method: 'POST',
      url: `${API}/projects/${projectId}/incidents/${incidentId}/correlation/run`,
      headers: bearer(token),
    });

    const after = await harness.app.inject({
      method: 'GET',
      url: `${API}/projects/${projectId}/incidents/${incidentId}/links`,
      headers: bearer(token),
    });
    const stillConfirmed = (after.json().items as Array<{ id: string; status: string }>).find(
      (link) => link.id === suggested?.id,
    );
    expect(stillConfirmed?.status).toBe('confirmed');
  });

  it('accepts a manual link to an entity in the same project', async () => {
    const { projectId, token, incidentId, deploymentId } = await scenario();

    const response = await harness.app.inject({
      method: 'POST',
      url: `${API}/projects/${projectId}/incidents/${incidentId}/links`,
      headers: bearer(token),
      payload: { entityType: 'deployment', entityId: deploymentId, note: 'Suspect' },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().status).toBe('confirmed');
    expect(response.json().entityId).toBe(deploymentId);
  });

  it('rejects a link to an entity outside the project', async () => {
    const { projectId, token, incidentId } = await scenario();

    const response = await harness.app.inject({
      method: 'POST',
      url: `${API}/projects/${projectId}/incidents/${incidentId}/links`,
      headers: bearer(token),
      payload: {
        entityType: 'deployment',
        entityId: '00000000-0000-0000-0000-000000000000',
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('NOT_FOUND');
  });
});
