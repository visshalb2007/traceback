#!/usr/bin/env node
/* global process, console */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';

/**
 * Starts a local Postgres for development on a machine without Docker.
 *
 * It mirrors the `db` service in `docker-compose.yml`: user/password `traceback`,
 * databases `traceback` and `traceback_test`, listening on :5432. The cluster is
 * created on first run and reused afterwards, so data survives restarts.
 *
 *   pnpm --filter @traceback/api db:local
 *
 * Leave it running (Ctrl+C stops it) and use `pnpm db:migrate` / `pnpm db:seed`
 * from another terminal, exactly as you would against Docker.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.resolve(here, '..');
const dataDir = path.join(apiDir, '.local-postgres');

const PORT = Number(process.env.LOCAL_DB_PORT ?? 5432);
const USER = 'traceback';
const PASSWORD = 'traceback';
const DATABASES = ['traceback', 'traceback_test'];

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: USER,
  password: PASSWORD,
  port: PORT,
  persistent: true,
  onLog: () => {},
  onError: (error) => console.error('[local-db]', error),
});

if (!fs.existsSync(path.join(dataDir, 'PG_VERSION'))) {
  console.log(`[local-db] initialising a fresh cluster in ${dataDir}`);
  await pg.initialise();
}

await pg.start();
console.log(`[local-db] Postgres ready at postgres://${USER}:${PASSWORD}@localhost:${PORT}`);

for (const name of DATABASES) {
  await pg.createDatabase(name).catch((error) => {
    if (!/already exists/i.test(String(error?.message))) {
      console.error(`[local-db] could not create "${name}":`, error?.message ?? error);
    }
  });
}

console.log(`[local-db] Databases: ${DATABASES.join(', ')}`);
console.log('[local-db] Next: pnpm db:migrate && pnpm db:seed  (web: pnpm dev)');
console.log('[local-db] Press Ctrl+C to stop.');

async function shutdown() {
  console.log('\n[local-db] stopping Postgres...');
  await pg.stop();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
