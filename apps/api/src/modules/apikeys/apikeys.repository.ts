import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../db/client';
import { apiKeys, users } from '../../db/schema';
import type { ApiKeyRow, NewApiKeyRow } from '../../db/schema';

export interface ApiKeyLookup {
  apiKey: ApiKeyRow;
  email: string | null;
}

export function createApiKeysRepository(db: DbExecutor) {
  return {
    async listByProject(projectId: string): Promise<ApiKeyRow[]> {
      return db
        .select()
        .from(apiKeys)
        .where(eq(apiKeys.projectId, projectId))
        .orderBy(desc(apiKeys.createdAt));
    },

    async findById(projectId: string, id: string): Promise<ApiKeyRow | undefined> {
      const [row] = await db
        .select()
        .from(apiKeys)
        .where(and(eq(apiKeys.projectId, projectId), eq(apiKeys.id, id)))
        .limit(1);
      return row;
    },

    /** Look a key up by its public prefix, joining the creator for an audit-ready email. */
    async findByPrefix(prefix: string): Promise<ApiKeyLookup | undefined> {
      const [row] = await db
        .select({ apiKey: apiKeys, email: users.email })
        .from(apiKeys)
        .leftJoin(users, eq(users.id, apiKeys.createdBy))
        .where(eq(apiKeys.prefix, prefix))
        .limit(1);
      return row;
    },

    async insert(row: NewApiKeyRow): Promise<ApiKeyRow> {
      const [inserted] = await db.insert(apiKeys).values(row).returning();
      if (!inserted) throw new Error('failed to insert api key');
      return inserted;
    },

    async revoke(projectId: string, id: string, at: Date): Promise<ApiKeyRow | undefined> {
      const [row] = await db
        .update(apiKeys)
        .set({ revokedAt: at })
        .where(and(eq(apiKeys.projectId, projectId), eq(apiKeys.id, id), isNull(apiKeys.revokedAt)))
        .returning();
      return row;
    },

    async touchLastUsed(id: string, at: Date): Promise<void> {
      await db.update(apiKeys).set({ lastUsedAt: at }).where(eq(apiKeys.id, id));
    },

    /** Remove keys whose expiry has passed (housekeeping; revocation is separate). */
    async deleteExpired(before: Date): Promise<number> {
      const rows = await db
        .delete(apiKeys)
        .where(
          sql`${apiKeys.expiresAt} is not null and ${apiKeys.expiresAt} < ${before.toISOString()}`,
        )
        .returning({ id: apiKeys.id });
      return rows.length;
    },
  };
}

export type ApiKeysRepository = ReturnType<typeof createApiKeysRepository>;
