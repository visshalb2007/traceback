import type { FastifyInstance } from 'fastify';
import type { AuthTokensResponse } from './harness';

export const API = '/api/v1';

let sequence = 0;

/** Fresh emails per test so a shared database never trips the unique index. */
export function uniqueEmail(prefix = 'user'): string {
  sequence += 1;
  return `${prefix}-${Date.now()}-${sequence}@example.com`;
}

export const PASSWORD = 'Sup3rSecretPassword';

/** Registers a user and fails loudly, since every other test builds on tokens. */
export async function registerUser(
  app: FastifyInstance,
  overrides: Partial<{ email: string; name: string; password: string }> = {},
): Promise<AuthTokensResponse> {
  const response = await app.inject({
    method: 'POST',
    url: `${API}/auth/register`,
    payload: {
      email: overrides.email ?? uniqueEmail(),
      name: overrides.name ?? 'Test User',
      password: overrides.password ?? PASSWORD,
    },
  });

  if (response.statusCode !== 201) {
    throw new Error(`registerUser failed: ${response.statusCode} ${response.body}`);
  }
  return response.json() as AuthTokensResponse;
}

export function bearer(token: string): { authorization: string } {
  return { authorization: `Bearer ${token}` };
}

export interface ProjectResponse {
  id: string;
  name: string;
  slug: string;
  rowVersion: number;
  role: string;
}

export async function createProject(
  app: FastifyInstance,
  token: string,
  payload: Partial<{ name: string; slug: string; description: string }> = {},
): Promise<ProjectResponse> {
  const response = await app.inject({
    method: 'POST',
    url: `${API}/projects`,
    headers: bearer(token),
    payload: { name: payload.name ?? 'Test Project', ...payload },
  });

  if (response.statusCode !== 201) {
    throw new Error(`createProject failed: ${response.statusCode} ${response.body}`);
  }
  return response.json() as ProjectResponse;
}
