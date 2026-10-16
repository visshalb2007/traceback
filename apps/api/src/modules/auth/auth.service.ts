import { randomUUID } from 'node:crypto';
import type { AuthTokens, LoginInput, RegisterInput, User } from '@traceback/shared';
import type { AppEnv } from '../../env';
import type { Database } from '../../db/client';
import type { UserRow } from '../../db/schema';
import { AppError } from '../../lib/errors';
import { hashPassword, verifyPassword } from '../../lib/password';
import { hashToken, signToken, verifyToken } from '../../lib/tokens';
import { createAuthRepository, type AuthRepository } from './auth.repository';

export interface RequestContext {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

export interface AuthService {
  register(input: RegisterInput, ctx?: RequestContext): Promise<AuthTokens>;
  login(input: LoginInput, ctx?: RequestContext): Promise<AuthTokens>;
  refresh(refreshToken: string, ctx?: RequestContext): Promise<AuthTokens>;
  logout(refreshToken: string | undefined, userId?: string): Promise<void>;
  me(userId: string): Promise<User>;
  verifyAccessToken(token: string): Promise<{ userId: string; email: string }>;
}

export function toUserDto(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
  };
}

export function createAuthService(db: Database, env: AppEnv): AuthService {
  const repo: AuthRepository = createAuthRepository(db);

  /**
   * A real argon2 hash of a random string, computed once. Used to burn the same
   * CPU time on unknown emails as on known ones so login timing cannot be used
   * to enumerate accounts.
   */
  let dummyHash: Promise<string> | undefined;
  const getDummyHash = (): Promise<string> => (dummyHash ??= hashPassword(randomUUID()));

  interface IssuedTokens {
    tokens: AuthTokens;
    refreshTokenId: string;
  }

  async function issueTokens(row: UserRow, ctx?: RequestContext): Promise<IssuedTokens> {
    const accessToken = await signToken(
      { sub: row.id, email: row.email, typ: 'access' },
      env.JWT_ACCESS_SECRET,
      env.JWT_ACCESS_TTL_SECONDS,
    );

    const refreshToken = await signToken(
      { sub: row.id, email: row.email, typ: 'refresh' },
      env.JWT_REFRESH_SECRET,
      env.JWT_REFRESH_TTL_SECONDS,
    );

    const stored = await repo.createRefreshToken({
      userId: row.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + env.JWT_REFRESH_TTL_SECONDS * 1000),
      ip: ctx?.ip ?? null,
      userAgent: ctx?.userAgent ?? null,
    });

    return {
      refreshTokenId: stored.id,
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: env.JWT_ACCESS_TTL_SECONDS,
        user: toUserDto(row),
      },
    };
  }

  return {
    async register(input, ctx) {
      const existing = await repo.findUserByEmail(input.email);
      if (existing) {
        throw AppError.conflict('An account with that email already exists');
      }

      const passwordHash = await hashPassword(input.password);
      const row = await repo.createUser({
        email: input.email,
        name: input.name,
        passwordHash,
      });

      const issued = await issueTokens(row, ctx);
      return issued.tokens;
    },

    async login(input, ctx) {
      const row = await repo.findUserByEmail(input.email);
      // Always run a verification so timing does not reveal whether the email exists.
      const verified = row
        ? await verifyPassword(row.passwordHash, input.password)
        : await verifyPassword(await getDummyHash(), input.password);

      if (!row || !verified) {
        throw new AppError('UNAUTHORIZED', 'Invalid email or password');
      }

      await repo.touchLastLogin(row.id, new Date());
      const issued = await issueTokens(row, ctx);
      return issued.tokens;
    },

    async refresh(refreshToken, ctx) {
      const payload = await verifyToken(refreshToken, env.JWT_REFRESH_SECRET);
      if (payload.typ !== 'refresh') {
        throw new AppError('UNAUTHORIZED', 'Not a refresh token');
      }

      const tokenHash = hashToken(refreshToken);
      const stored = await repo.findRefreshTokenByHash(tokenHash);

      if (!stored) {
        throw new AppError('UNAUTHORIZED', 'Refresh token is not recognised');
      }

      if (stored.revokedAt) {
        // A revoked token being presented means it leaked and is being replayed:
        // nuke the whole family so the attacker and the victim both have to re-auth.
        await repo.revokeAllForUser(stored.userId);
        throw new AppError('UNAUTHORIZED', 'Refresh token has already been used');
      }

      if (stored.expiresAt.getTime() <= Date.now()) {
        throw new AppError('UNAUTHORIZED', 'Refresh token has expired');
      }

      const row = await repo.findUserById(payload.sub);
      if (!row) {
        throw new AppError('UNAUTHORIZED', 'Account no longer exists');
      }

      const issued = await issueTokens(row, ctx);
      await repo.revokeRefreshToken(stored.id, issued.refreshTokenId);

      return issued.tokens;
    },

    async logout(refreshToken, userId) {
      if (refreshToken) {
        const stored = await repo.findRefreshTokenByHash(hashToken(refreshToken));
        if (stored) {
          await repo.revokeRefreshToken(stored.id);
          return;
        }
      }
      if (userId) {
        await repo.revokeAllForUser(userId);
      }
    },

    async me(userId) {
      const row = await repo.findUserById(userId);
      if (!row) throw AppError.notFound('User', userId);
      return toUserDto(row);
    },

    async verifyAccessToken(token) {
      const payload = await verifyToken(token, env.JWT_ACCESS_SECRET);
      if (payload.typ !== 'access') {
        throw new AppError('UNAUTHORIZED', 'Not an access token');
      }
      return { userId: payload.sub, email: payload.email };
    },
  };
}
