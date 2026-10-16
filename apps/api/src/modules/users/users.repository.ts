import { eq, inArray } from 'drizzle-orm';
import type { DbExecutor } from '../../db/client';
import { users } from '../../db/schema';
import type { UserRow } from '../../db/schema';

/**
 * Read model for users. Auth owns credentials; this is the directory everyone
 * else (members, assignees, actor names) looks people up in.
 */
export function createUsersRepository(db: DbExecutor) {
  return {
    async findById(id: string): Promise<UserRow | undefined> {
      const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      return row;
    },

    async findByEmail(email: string): Promise<UserRow | undefined> {
      const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      return row;
    },

    async findByIds(ids: string[]): Promise<Map<string, UserRow>> {
      if (ids.length === 0) return new Map();
      const rows = await db.select().from(users).where(inArray(users.id, ids));
      return new Map(rows.map((row) => [row.id, row]));
    },
  };
}

export type UsersRepository = ReturnType<typeof createUsersRepository>;
