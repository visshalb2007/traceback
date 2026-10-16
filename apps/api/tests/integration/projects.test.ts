import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { API, bearer, createProject, registerUser } from './helpers/api';
import { createTestHarness, hasTestDatabase, type TestHarness } from './helpers/harness';

describe.skipIf(!hasTestDatabase())('projects and RBAC (integration)', () => {
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

  it('creates a project, derives a slug and makes the creator an owner', async () => {
    const owner = await registerUser(harness.app);
    const project = await createProject(harness.app, owner.accessToken, { name: 'Payments API' });

    expect(project.role).toBe('owner');
    expect(project.slug).toBe('payments-api');
    expect(project.rowVersion).toBe(1);
  });

  it('lists only the projects the caller belongs to', async () => {
    const owner = await registerUser(harness.app);
    const outsider = await registerUser(harness.app);
    const project = await createProject(harness.app, owner.accessToken);

    const mine = await harness.app.inject({
      method: 'GET',
      url: `${API}/projects`,
      headers: bearer(owner.accessToken),
    });
    expect(mine.statusCode).toBe(200);
    expect(mine.json().items.map((item: { id: string }) => item.id)).toEqual([project.id]);

    const theirs = await harness.app.inject({
      method: 'GET',
      url: `${API}/projects`,
      headers: bearer(outsider.accessToken),
    });
    expect(theirs.json().items).toEqual([]);
  });

  it('hides a project from non-members behind a 404', async () => {
    const owner = await registerUser(harness.app);
    const outsider = await registerUser(harness.app);
    const project = await createProject(harness.app, owner.accessToken);

    const response = await harness.app.inject({
      method: 'GET',
      url: `${API}/projects/${project.id}`,
      headers: bearer(outsider.accessToken),
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('NOT_FOUND');
  });

  it('denies a viewer an update the owner is allowed to make', async () => {
    const owner = await registerUser(harness.app);
    const viewer = await registerUser(harness.app);
    const project = await createProject(harness.app, owner.accessToken);

    const invite = await harness.app.inject({
      method: 'POST',
      url: `${API}/projects/${project.id}/members`,
      headers: bearer(owner.accessToken),
      payload: { email: viewer.user.email, role: 'viewer' },
    });
    expect(invite.statusCode).toBe(201);

    const denied = await harness.app.inject({
      method: 'PATCH',
      url: `${API}/projects/${project.id}`,
      headers: bearer(viewer.accessToken),
      payload: { name: 'Renamed by viewer' },
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error.code).toBe('FORBIDDEN');

    const allowed = await harness.app.inject({
      method: 'PATCH',
      url: `${API}/projects/${project.id}`,
      headers: bearer(owner.accessToken),
      payload: { name: 'Renamed by owner' },
    });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.json().name).toBe('Renamed by owner');
  });

  it('returns 409 when an update carries a stale rowVersion', async () => {
    const owner = await registerUser(harness.app);
    const project = await createProject(harness.app, owner.accessToken);

    const response = await harness.app.inject({
      method: 'PATCH',
      url: `${API}/projects/${project.id}`,
      headers: bearer(owner.accessToken),
      payload: { name: 'Stale write', rowVersion: project.rowVersion + 5 },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('VERSION_CONFLICT');
  });

  it('refuses to remove the last owner', async () => {
    const owner = await registerUser(harness.app);
    const project = await createProject(harness.app, owner.accessToken);

    const response = await harness.app.inject({
      method: 'DELETE',
      url: `${API}/projects/${project.id}/members/${owner.user.id}`,
      headers: bearer(owner.accessToken),
    });
    // Self-removal is rejected outright, which also protects the last owner.
    expect(response.statusCode).toBe(409);
  });
});
