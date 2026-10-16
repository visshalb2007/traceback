import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type Database = PostgresJsDatabase<typeof schema>;
export type Sql = ReturnType<typeof postgres>;

/**
 * Drizzle's transaction handle exposes the same query builder as the root database,
 * so repositories accept either. That is what lets a mutation and its audit-log row
 * (and its event) be written in one transaction.
 */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export type DbExecutor = Database | Transaction;

export interface DbHandle {
  db: Database;
  sql: Sql;
  close: () => Promise<void>;
}

export interface CreateDbOptions {
  maxConnections?: number;
  /** Set true in tests to fail fast instead of retrying. */
  idleTimeoutSeconds?: number;
}

/**
 * One postgres.js pool per process. `onnotice` is silenced so Postgres NOTIFY
 * plumbing and `CREATE INDEX IF NOT EXISTS` notices do not spam the logs.
 */
export function createDbClient(url: string, options: CreateDbOptions = {}): DbHandle {
  const sql = postgres(url, {
    max: options.maxConnections ?? 10,
    idle_timeout: options.idleTimeoutSeconds ?? 30,
    connect_timeout: 10,
    onnotice: () => {},
    transform: { undefined: null },
  });

  const db = drizzle(sql, { schema, logger: false });

  return {
    db,
    sql,
    close: async () => {
      await sql.end({ timeout: 5 });
    },
  };
}
