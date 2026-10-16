import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildApp } from '../app';
import { loadEnv } from '../env';

/**
 * Writes `openapi.json` next to the API package. It builds the app but never
 * listens, and points at a database URL that is never dialled, so it runs without
 * Postgres — the document is generated purely from the route schemas.
 */
async function main(): Promise<void> {
  const app = await buildApp({
    env: loadEnv({
      NODE_ENV: 'development',
      DATABASE_URL: 'postgres://traceback:traceback@localhost:5432/traceback',
      LOG_LEVEL: 'silent',
    } as NodeJS.ProcessEnv),
  });

  await app.ready();
  const document = app.swagger();
  await app.close();

  const outPath = path.resolve(process.cwd(), 'openapi.json');
  await writeFile(outPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');

  const pathCount = Object.keys(document.paths ?? {}).length;
  console.log(`Wrote ${pathCount} paths to ${outPath}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
