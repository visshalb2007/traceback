import type { Event, EventEntityType, EventSource, EventType } from '@traceback/shared';
import type { Database } from '../../db/client';
import type { EventRow } from '../../db/schema';
import { createEventsRepository, type EventsRepository } from './events.repository';

export interface AppendEventInput {
  projectId: string;
  type: EventType;
  entityType: EventEntityType;
  entityId: string;
  actorId?: string | null;
  payload?: Record<string, unknown>;
  /** When it really happened. Defaults to "now". */
  occurredAt?: string | Date | undefined;
  /** Defaults to a deterministic key derived from the event identity. */
  idempotencyKey?: string | undefined;
  source?: EventSource;
}

export interface AppendEventResult {
  event: Event;
  /** True when this exact submission had already been stored. */
  replayed: boolean;
}

/**
 * A backdated event is "late" when it claims to have happened more than
 * `thresholdMs` before it actually reached us. Pure + exported so it is trivially
 * testable and reusable by the re-projection job.
 */
export function isLateEvent(occurredAt: Date, receivedAt: Date, thresholdMs: number): boolean {
  return receivedAt.getTime() - occurredAt.getTime() > thresholdMs;
}

/**
 * Deterministic fallback key. Two deliveries describing the same real-world event
 * with the same timestamp collapse to one row even if the caller forgot a key.
 */
export function deriveIdempotencyKey(input: {
  type: EventType;
  entityType: EventEntityType;
  entityId: string;
  occurredAt: Date;
}): string {
  return `${input.type}:${input.entityType}:${input.entityId}:${input.occurredAt.toISOString()}`;
}

export function toEventDto(row: EventRow): Event {
  return {
    id: row.id,
    projectId: row.projectId,
    sequence: String(row.sequence),
    type: row.type,
    entityType: row.entityType,
    entityId: row.entityId,
    actorId: row.actorId,
    payload: row.payload,
    occurredAt: row.occurredAt.toISOString(),
    receivedAt: row.receivedAt.toISOString(),
    isLate: row.isLate,
    idempotencyKey: row.idempotencyKey,
    source: row.source,
  };
}

export interface EventsService {
  append(input: AppendEventInput): Promise<AppendEventResult>;
  /** Reads back an existing event without inserting (used by replay paths). */
  find(projectId: string, idempotencyKey: string): Promise<Event | undefined>;
  /** Full write-ordered history for one entity, newest first. */
  listForEntity(projectId: string, entityType: EventEntityType, entityId: string): Promise<Event[]>;
}

export function createEventsService(db: Database, lateThresholdMs: number): EventsService {
  const repo: EventsRepository = createEventsRepository(db);

  return {
    async append(input) {
      const receivedAt = new Date();
      const occurredAt =
        input.occurredAt instanceof Date
          ? input.occurredAt
          : input.occurredAt
            ? new Date(input.occurredAt)
            : receivedAt;

      if (Number.isNaN(occurredAt.getTime())) {
        throw new Error(`invalid occurredAt: ${String(input.occurredAt)}`);
      }

      const idempotencyKey =
        input.idempotencyKey ??
        deriveIdempotencyKey({
          type: input.type,
          entityType: input.entityType,
          entityId: input.entityId,
          occurredAt,
        });

      const row = {
        projectId: input.projectId,
        type: input.type,
        entityType: input.entityType,
        entityId: input.entityId,
        actorId: input.actorId ?? null,
        payload: input.payload ?? {},
        occurredAt,
        receivedAt,
        isLate: isLateEvent(occurredAt, receivedAt, lateThresholdMs),
        idempotencyKey,
        source: input.source ?? 'api',
      } satisfies Parameters<EventsRepository['insert']>[0];

      try {
        return { event: toEventDto(await repo.insert(row)), replayed: false };
      } catch (error) {
        // 23505 = unique_violation on (project_id, idempotency_key).
        if (isUniqueViolation(error)) {
          const existing = await repo.findByIdempotencyKey(input.projectId, idempotencyKey);
          if (existing) {
            return { event: toEventDto(existing), replayed: true };
          }
        }
        throw error;
      }
    },

    async find(projectId, idempotencyKey) {
      const row = await repo.findByIdempotencyKey(projectId, idempotencyKey);
      return row ? toEventDto(row) : undefined;
    },

    async listForEntity(projectId, entityType, entityId) {
      const rows = await repo.listForEntity(projectId, entityType, entityId);
      return rows.map(toEventDto);
    },
  };
}

export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}
