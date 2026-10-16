import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { ApiKey, ApiKeyWithSecret, CreateApiKeyInput, ProjectRole } from '@traceback/shared';
import { PROJECT_ROLE_RANK } from '@traceback/shared';
import type { Database } from '../../db/client';
import type { ApiKeyRow } from '../../db/schema';
import { AppError } from '../../lib/errors';
import type { AuditContext } from '../audit/audit.service';
import { writeAudit } from '../audit/audit.service';
import { createApiKeysRepository, type ApiKeysRepository } from './apikeys.repository';

const PREFIX_ROOT = 'tbk';
const PREFIX_BYTES = 4;
const SECRET_BYTES = 24;

/**
 * The public prefix of a token (`tbk_<8hex>`), or null if the token is not shaped
 * like an API key at all. Pure so the auth plugin can decide cheaply whether to
 * even consult the API-key table.
 */
export function apiKeyPrefix(token: string): string | null {
  const first = token.split('_')[1];
  if (!token.startsWith(`${PREFIX_ROOT}_`) || !first) return null;
  return `${PREFIX_ROOT}_${first}`;
}

/** SHA-256 is enough for API keys: they are high-entropy, unlike human passwords. */
export function hashApiKey(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface GeneratedApiKey {
  token: string;
  prefix: string;
  tokenHash: string;
}

export function generateApiKey(): GeneratedApiKey {
  const prefix = `${PREFIX_ROOT}_${randomBytes(PREFIX_BYTES).toString('hex')}`;
  const secret = randomBytes(SECRET_BYTES).toString('hex');
  const token = `${prefix}_${secret}`;
  return { token, prefix, tokenHash: hashApiKey(token) };
}

/** Constant-time compare of the stored hash against the presented token's hash. */
export function hashMatches(storedHash: string, token: string): boolean {
  const expected = Buffer.from(storedHash);
  const actual = Buffer.from(hashApiKey(token));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** A key may never grant more than the person who created it already has. */
export function capRole(requested: ProjectRole, actorRole: ProjectRole): ProjectRole {
  return PROJECT_ROLE_RANK[requested] <= PROJECT_ROLE_RANK[actorRole] ? requested : actorRole;
}

export function toApiKeyDto(row: ApiKeyRow): ApiKey {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    prefix: row.prefix,
    role: row.role,
    createdBy: row.createdBy,
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Identity resolved from a presented API key, consumed by the auth plugin. */
export interface ApiKeyIdentity {
  apiKeyId: string;
  projectId: string;
  role: ProjectRole;
  userId: string;
  email: string | null;
}

export interface ApiKeysService {
  list(projectId: string): Promise<ApiKey[]>;
  create(
    projectId: string,
    input: CreateApiKeyInput,
    actorId: string,
    actorRole: ProjectRole,
    context?: AuditContext,
  ): Promise<ApiKeyWithSecret>;
  revoke(projectId: string, keyId: string, actorId: string, context?: AuditContext): Promise<void>;
  /** Resolve a presented token to an identity, or undefined if invalid. */
  authenticate(token: string): Promise<ApiKeyIdentity | undefined>;
}

export function createApiKeysService(db: Database): ApiKeysService {
  const repo: ApiKeysRepository = createApiKeysRepository(db);

  return {
    async list(projectId) {
      const rows = await repo.listByProject(projectId);
      return rows.map(toApiKeyDto);
    },

    async create(projectId, input, actorId, actorRole, context) {
      const role = capRole(input.role, actorRole);
      const generated = generateApiKey();

      return db.transaction(async (tx) => {
        const txRepo = createApiKeysRepository(tx);
        const inserted = await txRepo.insert({
          projectId,
          name: input.name,
          prefix: generated.prefix,
          tokenHash: generated.tokenHash,
          role,
          createdBy: actorId,
          // Keys never expire on their own: they are revoked explicitly. Kept as a
          // column so a TTL can be introduced later without a data migration.
          expiresAt: null,
        });

        await writeAudit(tx, {
          projectId,
          actorId,
          action: 'create',
          entityType: 'api_key',
          entityId: inserted.id,
          after: { name: inserted.name, prefix: inserted.prefix, role: inserted.role },
          ip: context?.ip,
          userAgent: context?.userAgent,
        });

        return { ...toApiKeyDto(inserted), token: generated.token };
      });
    },

    async revoke(projectId, keyId, actorId, context) {
      await db.transaction(async (tx) => {
        const txRepo = createApiKeysRepository(tx);
        const existing = await txRepo.findById(projectId, keyId);
        if (!existing) throw AppError.notFound('API key', keyId);

        const row = await txRepo.revoke(projectId, keyId, new Date());
        if (!row) throw AppError.notFound('API key', keyId);

        await writeAudit(tx, {
          projectId,
          actorId,
          action: 'delete',
          entityType: 'api_key',
          entityId: keyId,
          before: { name: existing.name, prefix: existing.prefix, role: existing.role },
          ip: context?.ip,
          userAgent: context?.userAgent,
        });
      });
    },

    async authenticate(token) {
      const prefix = apiKeyPrefix(token);
      if (!prefix) return undefined;

      const lookup = await repo.findByPrefix(prefix);
      if (!lookup) return undefined;

      const { apiKey, email } = lookup;
      if (apiKey.revokedAt) return undefined;
      if (apiKey.expiresAt && apiKey.expiresAt.getTime() <= Date.now()) return undefined;
      if (!apiKey.createdBy) return undefined; // creator deleted -> key is inert
      if (!hashMatches(apiKey.tokenHash, token)) return undefined;

      // Best-effort usage stamp; a failure here must never fail the request.
      void repo.touchLastUsed(apiKey.id, new Date()).catch(() => undefined);

      return {
        apiKeyId: apiKey.id,
        projectId: apiKey.projectId,
        role: apiKey.role,
        userId: apiKey.createdBy,
        email,
      };
    },
  };
}
