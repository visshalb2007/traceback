import type { Change, ChangeType, RecordChangeInput } from '@traceback/shared';
import type { Database } from '../../db/client';
import type { ChangeRow } from '../../db/schema';
import { AppError } from '../../lib/errors';
import { encodeCursor, decodeCursor } from '../../lib/cursor';
import type { EventsService } from '../events/events.service';
import { createChangesRepository, type ChangesRepository } from './changes.repository';

/**
 * Dedupe + trim a list of tags. Webhook payloads happily repeat the same path or
 * service name, and the correlation engine only cares about membership, so we
 * keep first-seen casing and drop case-insensitive repeats.
 */
export function normalizeList(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    if (value.length === 0) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

export function toChangeDto(row: ChangeRow): Change {
  return {
    id: row.id,
    projectId: row.projectId,
    deploymentId: row.deploymentId,
    type: row.type,
    sha: row.sha,
    title: row.title,
    message: row.message,
    authorEmail: row.authorEmail,
    authorName: row.authorName,
    branch: row.branch,
    url: row.url,
    filesChanged: row.filesChanged,
    services: row.services,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface RecordChangeResult extends Change {
  /** True when this sha/idempotency key had already been stored. */
  replayed: boolean;
}

export interface ChangeListResult {
  items: Change[];
  nextCursor: string | null;
}

export interface ChangeListFilters {
  type?: ChangeType | undefined;
  service?: string | undefined;
  authorEmail?: string | undefined;
  deploymentId?: string | undefined;
  limit: number;
  cursor?: string | undefined;
}

export interface ChangesService {
  record(
    projectId: string,
    input: RecordChangeInput,
    actorId: string | null,
  ): Promise<RecordChangeResult>;
  list(projectId: string, filters: ChangeListFilters): Promise<ChangeListResult>;
  get(projectId: string, changeId: string): Promise<Change>;
}

export function createChangesService(db: Database, events: EventsService): ChangesService {
  const repo: ChangesRepository = createChangesRepository(db);

  const replay = async (
    projectId: string,
    changeId: string,
  ): Promise<RecordChangeResult | undefined> => {
    const row = await repo.findById(projectId, changeId);
    return row ? { ...toChangeDto(row), replayed: true } : undefined;
  };

  return {
    async record(projectId, input, actorId) {
      // An explicit idempotency key wins: it is the caller telling us "this is the
      // same submission", which is stronger evidence than a matching sha.
      if (input.idempotencyKey) {
        const existing = await events.find(projectId, input.idempotencyKey);
        if (existing && existing.entityType === 'change') {
          const replayed = await replay(projectId, existing.entityId);
          if (replayed) return replayed;
        }
      }

      // A sha identifies a commit within a repository, so re-delivery collapses
      // onto the existing row instead of raising a unique-constraint error.
      const bySha = await repo.findBySha(projectId, input.sha);
      if (bySha) return { ...toChangeDto(bySha), replayed: true };

      if (input.deploymentId) {
        const exists = await repo.deploymentExists(projectId, input.deploymentId);
        if (!exists) throw AppError.notFound('Deployment', input.deploymentId);
      }

      const filesChanged = normalizeList(input.filesChanged);
      const services = normalizeList(input.services);
      const receivedAt = new Date();
      const occurredAt = input.occurredAt ? new Date(input.occurredAt) : receivedAt;

      const row = await repo.insert({
        projectId,
        deploymentId: input.deploymentId ?? null,
        type: input.type,
        sha: input.sha,
        title: input.title,
        message: input.message ?? null,
        authorEmail: input.authorEmail ?? null,
        authorName: input.authorName ?? null,
        branch: input.branch ?? null,
        url: input.url ?? null,
        filesChanged,
        services,
      });

      await events.append({
        projectId,
        type: 'change.recorded',
        entityType: 'change',
        entityId: row.id,
        actorId,
        occurredAt,
        idempotencyKey: input.idempotencyKey,
        payload: {
          sha: row.sha,
          changeType: row.type,
          deploymentId: row.deploymentId,
          filesChanged: row.filesChanged.length,
          services: row.services,
        },
      });

      return { ...toChangeDto(row), replayed: false };
    },

    async list(projectId, filters) {
      const cursorParts = filters.cursor ? decodeCursor(filters.cursor) : [];
      const rows = await repo.list(projectId, {
        type: filters.type,
        service: filters.service,
        authorEmail: filters.authorEmail,
        deploymentId: filters.deploymentId,
        limit: filters.limit,
        cursorCreatedAt: cursorParts[0],
        cursorId: cursorParts[1],
      });

      const hasMore = rows.length > filters.limit;
      const page = hasMore ? rows.slice(0, filters.limit) : rows;
      const last = page[page.length - 1];

      return {
        items: page.map(toChangeDto),
        nextCursor: hasMore && last ? encodeCursor([last.createdAt.toISOString(), last.id]) : null,
      };
    },

    async get(projectId, changeId) {
      const row = await repo.findById(projectId, changeId);
      if (!row) throw AppError.notFound('Change', changeId);
      return toChangeDto(row);
    },
  };
}
