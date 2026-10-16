import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { API, bearer, createProject, registerUser } from './helpers/api';
import { createTestHarness, hasTestDatabase, type TestHarness } from './helpers/harness';

describe.skipIf(!hasTestDatabase())('project API keys (integration)', () => {
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

  async function issueKey(
    projectId: string,
    token: string,
    role: 'maintainer' | 'member' | 'viewer',
  ): Promise<{ id: string; token: string; prefix: string; role: string }> {
    const response = await harness.app.inject({
      method: 'POST',
      url: `${API}/projects/${projectId}/api-keys`,
      headers: bearer(token),
      payload: { name: 'CI pipeline', role },
    });
    expect(response.statusCode).toBe(201);
    return response.json();
  }

  it('issues a key that authenticates as its creator', async () => {
    const owner = await registerUser(harness.app);
    const project = await createProject(harness.app, owner.accessToken);
    const key = await issueKey(project.id, owner.accessToken, 'member');

    expect(key.token.startsWith('tbk_')).toBe(true);
    // The stored hash must never be echoed back.
    expect(JSON.stringify(key)).not.toContain('tokenHash');

    const read = await harness.app.inject({
      method: 'GET',
      url: `${API}/projects/${project.id}`,
      headers: bearer(key.token),
    });
    expect(read.statusCode).toBe(200);
    expect(read.json().id).toBe(project.id);
  });

  it('caps a key at the role it was granted', async () => {
    const owner = await registerUser(harness.app);
    const project = await createProject(harness.app, owner.accessToken);
    const key = await issueKey(project.id, owner.accessToken, 'viewer');

    const response = await harness.app.inject({
      method: 'PATCH',
      url: `${API}/projects/${project.id}`,
      headers: bearer(key.token),
      payload: { name: 'Should not apply' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('FORBIDDEN');
  });

  it('cannot be used against a different project', async () => {
    const owner = await registerUser(harness.app);
    const first = await createProject(harness.app, owner.accessToken, { name: 'First' });
    const second = await createProject(harness.app, owner.accessToken, { name: 'Second' });
    const key = await issueKey(first.id, owner.accessToken, 'member');

    const response = await harness.app.inject({
      method: 'GET',
      url: `${API}/projects/${second.id}`,
      headers: bearer(key.token),
    });
    expect(response.statusCode).toBe(404);
  });

  it('stops working once revoked', async () => {
    const owner = await registerUser(harness.app);
    const project = await createProject(harness.app, owner.accessToken);
    const key = await issueKey(project.id, owner.accessToken, 'member');

    const revoke = await harness.app.inject({
      method: 'DELETE',
      url: `${API}/projects/${project.id}/api-keys/${key.id}`,
      headers: bearer(owner.accessToken),
    });
    expect(revoke.statusCode).toBe(204);

    const after = await harness.app.inject({
      method: 'GET',
      url: `${API}/projects/${project.id}`,
      headers: bearer(key.token),
    });
    expect(after.statusCode).toBe(401);
    expect(after.json().error.code).toBe('UNAUTHORIZED');
  });
});
