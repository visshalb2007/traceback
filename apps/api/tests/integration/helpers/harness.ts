import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../../src/app';
import { loadEnv } from '../../../src/env';
import { runMigrations } from '../../../src/db/migrator';
import { createDbClient, type DbHandle } from '../../../src/db/client';

/**
 * Integration tests run against a real Postgres — the docker-compose `db-test`
 * service:
 *
 *   docker compose --profile test up -d db-test
 *   TEST_DATABASE_URL=postgres://traceback:traceback@localhost:5433/traceback_test pnpm test
 *
 * When TEST_DATABASE_URL is absent the suite is skipped rather than failed, so a
 * fresh clone still has a green `pnpm test`.
 */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

export const hasTestDatabase = (): boolean => Boolean(TEST_DATABASE_URL);

export interface TestHarness {
  app: FastifyInstance;
  sql: DbHandle['sql'];
  truncateAll: () => Promise<void>;
  close: () => Promise<void>;
}

export async function createTestHarness(): Promise<TestHarness> {
  if (!TEST_DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL is not set');
  }

  await runMigrations(TEST_DATABASE_URL);

  const handle = createDbClient(TEST_DATABASE_URL, { maxConnections: 4 });

  const app = await buildApp({
    env: loadEnv({
      NODE_ENV: 'test',
      DATABASE_URL: TEST_DATABASE_URL,
      JWT_ACCESS_SECRET: 'test-access-secret-at-least-16-chars',
      JWT_REFRESH_SECRET: 'test-refresh-secret-at-least-16-chars',
      LOG_LEVEL: 'silent',
    } as NodeJS.ProcessEnv),
  });
  await app.ready();

  const truncateAll = async (): Promise<void> => {
    const rows = await handle.sql<{ tablename: string }[]>`
      select tablename from pg_tables
      where schemaname = 'public' and tablename <> '__drizzle_migrations'
    `;
    if (rows.length === 0) return;
    const list = rows.map((row) => `"public"."${row.tablename}"`).join(', ');
    await handle.sql.unsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  };

  return {
    app,
    sql: handle.sql,
    truncateAll,
    close: async () => {
      await app.close();
      await handle.close();
    },
  };
}

export interface AuthTokensResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: { id: string; email: string; name: string };
}
