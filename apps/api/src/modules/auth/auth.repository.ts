import { and, eq, isNull } from 'drizzle-orm';
import type { DbExecutor } from '../../db/client';
import { refreshTokens, users } from '../../db/schema';
import type { NewUserRow, RefreshTokenRow, UserRow } from '../../db/schema';

export interface CreateUserInput {
  email: string;
  name: string;
  passwordHash: string;
}

export interface CreateRefreshTokenInput {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Pure persistence. No hashing, no token logic, no authorization — those live in
 * the service. Every method takes/returns rows or plain values.
 */
export function createAuthRepository(db: DbExecutor) {
  return {
    async createUser(input: CreateUserInput): Promise<UserRow> {
      const [row] = await db
        .insert(users)
        .values(input as NewUserRow)
        .returning();
      if (!row) throw new Error('failed to insert user');
      return row;
    },

    async findUserByEmail(email: string): Promise<UserRow | undefined> {
      const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      return row;
    },

    async findUserById(id: string): Promise<UserRow | undefined> {
      const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      return row;
    },

    async touchLastLogin(id: string, at: Date): Promise<void> {
      await db.update(users).set({ lastLoginAt: at, updatedAt: at }).where(eq(users.id, id));
    },

    async createRefreshToken(input: CreateRefreshTokenInput): Promise<RefreshTokenRow> {
      const [row] = await db
        .insert(refreshTokens)
        .values({
          userId: input.userId,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
          ip: input.ip ?? null,
          userAgent: input.userAgent ?? null,
        })
        .returning();
      if (!row) throw new Error('failed to insert refresh token');
      return row;
    },

    async findActiveRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenRow | undefined> {
      const [row] = await db
        .select()
        .from(refreshTokens)
        .where(and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.revokedAt)))
        .limit(1);
      return row;
    },

    async findRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenRow | undefined> {
      const [row] = await db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.tokenHash, tokenHash))
        .limit(1);
      return row;
    },

    async revokeRefreshToken(id: string, replacedById?: string): Promise<void> {
      await db
        .update(refreshTokens)
        .set({ revokedAt: new Date(), replacedById: replacedById ?? null })
        .where(eq(refreshTokens.id, id));
    },

    async revokeAllForUser(userId: string): Promise<void> {
      await db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
    },
  };
}

export type AuthRepository = ReturnType<typeof createAuthRepository>;
