import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createTestHarness,
  hasTestDatabase,
  type AuthTokensResponse,
  type TestHarness,
} from './helpers/harness';

const API = '/api/v1';

const credentials = {
  email: 'ada@example.com',
  name: 'Ada Lovelace',
  password: 'Sup3rSecretPassword',
};

describe.skipIf(!hasTestDatabase())('auth flows (integration)', () => {
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

  async function register(
    overrides: Partial<typeof credentials> = {},
  ): Promise<AuthTokensResponse> {
    const response = await harness.app.inject({
      method: 'POST',
      url: `${API}/auth/register`,
      payload: { ...credentials, ...overrides },
    });
    expect(response.statusCode).toBe(201);
    return response.json() as AuthTokensResponse;
  }

  it('registers a user and returns an access + refresh token pair', async () => {
    const body = await register();
    expect(body.user.email).toBe(credentials.email);
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
    expect(body.expiresIn).toBeGreaterThan(0);
    // The password hash must never leave the database.
    expect(JSON.stringify(body)).not.toContain('argon2');
  });

  it('rejects a duplicate email with the canonical error envelope', async () => {
    await register();
    const response = await harness.app.inject({
      method: 'POST',
      url: `${API}/auth/register`,
      payload: { ...credentials, name: 'Someone Else' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('CONFLICT');
  });

  it('rejects a weak password with a validation error', async () => {
    const response = await harness.app.inject({
      method: 'POST',
      url: `${API}/auth/register`,
      payload: { email: 'weak@example.com', name: 'Weak', password: 'short' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('logs in with valid credentials and rejects a wrong password', async () => {
    await register();

    const ok = await harness.app.inject({
      method: 'POST',
      url: `${API}/auth/login`,
      payload: { email: credentials.email, password: credentials.password },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().user.email).toBe(credentials.email);

    const bad = await harness.app.inject({
      method: 'POST',
      url: `${API}/auth/login`,
      payload: { email: credentials.email, password: 'WrongPassword123' },
    });
    expect(bad.statusCode).toBe(401);
    expect(bad.json().error.code).toBe('UNAUTHORIZED');
  });

  it('returns the current user for /auth/me and 401 without a token', async () => {
    const tokens = await register();

    const authed = await harness.app.inject({
      method: 'GET',
      url: `${API}/auth/me`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(authed.statusCode).toBe(200);
    expect(authed.json().id).toBe(tokens.user.id);

    const anonymous = await harness.app.inject({ method: 'GET', url: `${API}/auth/me` });
    expect(anonymous.statusCode).toBe(401);
  });

  it('rotates refresh tokens and detects replay of a revoked one', async () => {
    const first = await register();

    const rotated = await harness.app.inject({
      method: 'POST',
      url: `${API}/auth/refresh`,
      payload: { refreshToken: first.refreshToken },
    });
    expect(rotated.statusCode).toBe(200);
    const second = rotated.json() as AuthTokensResponse;
    expect(second.refreshToken).not.toBe(first.refreshToken);

    // Replaying the superseded token must fail...
    const replay = await harness.app.inject({
      method: 'POST',
      url: `${API}/auth/refresh`,
      payload: { refreshToken: first.refreshToken },
    });
    expect(replay.statusCode).toBe(401);

    // ...and must revoke the whole family, including the newest token.
    const afterReplay = await harness.app.inject({
      method: 'POST',
      url: `${API}/auth/refresh`,
      payload: { refreshToken: second.refreshToken },
    });
    expect(afterReplay.statusCode).toBe(401);
  });

  it('rejects an access token presented as a refresh token', async () => {
    const tokens = await register();
    const response = await harness.app.inject({
      method: 'POST',
      url: `${API}/auth/refresh`,
      payload: { refreshToken: tokens.accessToken },
    });
    expect(response.statusCode).toBe(401);
  });
});
