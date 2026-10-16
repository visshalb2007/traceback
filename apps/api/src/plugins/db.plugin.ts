import fp from 'fastify-plugin';
import { createDbClient, type Database, type DbHandle } from '../db/client';
import type { AppEnv } from '../env';

declare module 'fastify' {
  interface FastifyInstance {
    db: Database;
    dbHandle: DbHandle;
    /** Cheap liveness probe used by GET /health. */
    dbHealthcheck: () => Promise<'up' | 'down'>;
  }
}

export interface DbPluginOptions {
  env: AppEnv;
}

/**
 * Owns the single postgres.js pool for the process and exposes it as `app.db`.
 * The pool connects lazily, so the app boots (and tests run) even when Postgres
 * is not reachable — the health check simply reports `down`.
 */
export const dbPlugin = fp<DbPluginOptions>(
  async (app, { env }) => {
    const handle = createDbClient(env.DATABASE_URL, {
      maxConnections: env.DATABASE_POOL_MAX,
    });

    app.decorate('db', handle.db);
    app.decorate('dbHandle', handle);
    app.decorate('dbHealthcheck', async (): Promise<'up' | 'down'> => {
      try {
        await handle.sql`select 1`;
        return 'up';
      } catch (error) {
        app.log.debug({ err: error }, 'database healthcheck failed');
        return 'down';
      }
    });

    app.addHook('onClose', async () => {
      await handle.close();
    });
  },
  { name: 'traceback-db' },
);
