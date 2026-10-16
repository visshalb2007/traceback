import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDbClient } from './client';

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

/** Applies every pending SQL migration from `apps/api/drizzle`. */
export async function runMigrations(databaseUrl: string): Promise<void> {
  const handle = createDbClient(databaseUrl, { maxConnections: 1 });
  try {
    await migrate(handle.db, { migrationsFolder });
  } finally {
    await handle.close();
  }
}
