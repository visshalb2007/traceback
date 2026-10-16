import 'dotenv/config';
import { loadEnv } from '../env';
import { runMigrations } from './migrator';

/** CLI entrypoint: `pnpm --filter @traceback/api db:migrate`. */
async function main(): Promise<void> {
  const env = loadEnv();

  console.log(`Applying migrations to ${env.DATABASE_URL.replace(/:[^:@/]*@/, ':****@')}`);
  await runMigrations(env.DATABASE_URL);

  console.log('Migrations applied.');
}

main().catch((error: unknown) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
