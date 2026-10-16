import type { AuditAction, AuditLog } from '@traceback/shared';
import type { DbExecutor } from '../../db/client';
import type { AuditLogRow } from '../../db/schema';
import { isEqual } from '../../lib/merge';
import { encodeCursor, decodeCursor } from '../../lib/cursor';
import {
  createAuditRepository,
  type AuditListFilters,
  type AuditRepository,
} from './audit.repository';

/** Request-scoped facts that make an audit row attributable. */
export interface AuditContext {
  ip?: string | null;
  userAgent?: string | null;
}

export interface AuditEntry extends AuditContext {
  projectId?: string | null;
  actorId?: string | null;
  actorEmail?: string | null;
  action: AuditAction;
  entityType: string;
  /** Text, not uuid: some entities (webhooks, api keys) are not uuid-keyed. */
  entityId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  diff?: Record<string, unknown> | null;
}

/**
 * Field-level diff in the shape the audit table stores:
 * `{ field: { before, after } }`. Only fields that actually changed appear, so an
 * auditor can see exactly what a request altered without diffing two blobs.
 */
export function buildAuditDiff(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): Record<string, { before: unknown; after: unknown }> {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const diff: Record<string, { before: unknown; after: unknown }> = {};
  for (const key of keys) {
    const previous = before?.[key] ?? null;
    const next = after?.[key] ?? null;
    if (!isEqual(previous, next)) diff[key] = { before: previous, after: next };
  }
  return diff;
}

/**
 * Write an audit row through a specific executor. Callers pass their transaction so
 * the audit row commits atomically with the mutation it describes — there is no way
 * for a mutation to succeed while its audit trail is lost, or vice versa.
 */
export async function writeAudit(executor: DbExecutor, entry: AuditEntry): Promise<AuditLogRow> {
  const repo = createAuditRepository(executor);
  return repo.insert({
    projectId: entry.projectId ?? null,
    actorId: entry.actorId ?? null,
    actorEmail: entry.actorEmail ?? null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    before: entry.before ?? null,
    after: entry.after ?? null,
    diff:
      entry.diff ??
      (entry.before || entry.after ? buildAuditDiff(entry.before, entry.after) : null),
    ip: entry.ip ?? null,
    userAgent: entry.userAgent ?? null,
  });
}

export function toAuditLogDto(row: AuditLogRow): AuditLog {
  return {
    id: row.id,
    projectId: row.projectId,
    actorId: row.actorId,
    actorEmail: row.actorEmail,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    before: row.before,
    after: row.after,
    diff: row.diff,
    ip: row.ip,
    userAgent: row.userAgent,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface AuditListResult {
  items: AuditLog[];
  nextCursor: string | null;
}

export interface AuditService {
  list(
    projectId: string,
    filters: Omit<AuditListFilters, 'cursorCreatedAt' | 'cursorId'> & {
      cursor?: string | undefined;
    },
  ): Promise<AuditListResult>;
}

export function createAuditService(db: DbExecutor): AuditService {
  const repo: AuditRepository = createAuditRepository(db);

  return {
    async list(projectId, filters) {
      const cursorParts = filters.cursor ? decodeCursor(filters.cursor) : [];
      const rows = await repo.list(projectId, {
        ...filters,
        cursorCreatedAt: cursorParts[0],
        cursorId: cursorParts[1],
      });

      const hasMore = rows.length > filters.limit;
      const page = hasMore ? rows.slice(0, filters.limit) : rows;
      const last = page[page.length - 1];

      return {
        items: page.map(toAuditLogDto),
        nextCursor: hasMore && last ? encodeCursor([last.createdAt.toISOString(), last.id]) : null,
      };
    },
  };
}
