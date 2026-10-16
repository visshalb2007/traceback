import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { projectRoleEnum } from './enums';
import { projects } from './projects';
import { users } from './users';

/**
 * Project-scoped API keys for machine access (CI, scripts). The plaintext token is
 * shown once and never stored; only its SHA-256 hash and a public searchable prefix
 * are persisted. A key inherits a fixed role, capped at the creator's role, so a
 * leaked key can never grant more than the person who minted it.
 */
export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Public identifier, e.g. `tbk_1a2b3c4d`, used to find the row before hashing. */
    prefix: text('prefix').notNull(),
    tokenHash: text('token_hash').notNull(),
    role: projectRoleEnum('role').notNull().default('viewer'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    prefixUnique: uniqueIndex('api_keys_prefix_idx').on(table.prefix),
    projectIdx: index('api_keys_project_idx').on(table.projectId),
  }),
);

export type ApiKeyRow = typeof apiKeys.$inferSelect;
export type NewApiKeyRow = typeof apiKeys.$inferInsert;
