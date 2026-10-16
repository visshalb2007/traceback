import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit needs a real connection string to diff against for `generate`; it
 * never connects during `generate`, only `push`/`studio` do.
 */
export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  verbose: true,
  strict: true,
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://traceback:traceback@localhost:5432/traceback',
  },
});
