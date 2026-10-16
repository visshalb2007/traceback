import type { CreateIncidentInput, Incident } from '@traceback/shared';
import type { Database } from '../../db/client';
import type { IncidentRow } from '../../db/schema';
import { AppError } from '../../lib/errors';
import { encodeCursor, decodeCursor } from '../../lib/cursor';
import type { EventsService } from '../events/events.service';
import { computeFingerprint } from './fingerprint';
import {
  createIncidentsRepository,
  type IncidentListFilters,
  type IncidentsRepository,
  type IncidentSortKey,
  type SortOrder,
} from './incidents.repository';

export function toIncidentDto(row: IncidentRow): Incident {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    description: row.description,
    severity: row.severity,
    status: row.status,
    service: row.service,
    errorSignature: row.errorSignature,
    affectedComponents: row.affectedComponents,
    environment: row.environment,
    fingerprint: row.fingerprint,
    startedAt: row.startedAt.toISOString(),
    detectedAt: row.detectedAt ? row.detectedAt.toISOString() : null,
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    resolvedBy: row.resolvedBy,
    resolution: row.resolution,
    rowVersion: row.rowVersion,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface RecordIncidentResult extends Incident {
  replayed: boolean;
}

export interface IncidentListResult {
  items: Incident[];
  nextCursor: string | null;
}

/** The value stored in the keyset cursor for the active sort column. */
function sortValueOf(row: IncidentRow, sort: IncidentSortKey): string {
  switch (sort) {
    case 'startedAt':
      return row.startedAt.toISOString();
    case 'updatedAt':
      return row.updatedAt.toISOString();
    case 'severity':
      return row.severity;
    case 'status':
      return row.status;
  }
}

export interface IncidentsService {
  create(
    projectId: string,
    input: CreateIncidentInput,
    actorId: string | null,
  ): Promise<RecordIncidentResult>;
  list(
    projectId: string,
    filters: Omit<IncidentListFilters, 'cursorValue' | 'cursorId'> & {
      cursor?: string | undefined;
    },
  ): Promise<IncidentListResult>;
  get(projectId: string, incidentId: string): Promise<Incident>;
}

export function createIncidentsService(db: Database, events: EventsService): IncidentsService {
  const repo: IncidentsRepository = createIncidentsRepository(db);

  return {
    async create(projectId, input, actorId) {
      if (input.idempotencyKey) {
        const existing = await events.find(projectId, input.idempotencyKey);
        if (existing && existing.entityType === 'incident') {
          const row = await repo.findById(projectId, existing.entityId);
          if (row) return { ...toIncidentDto(row), replayed: true };
        }
      }

      const receivedAt = new Date();
      const occurredAt = input.occurredAt ? new Date(input.occurredAt) : receivedAt;
      const fingerprint = computeFingerprint({
        title: input.title,
        service: input.service,
        errorSignature: input.errorSignature,
      });

      const row = await repo.insert({
        projectId,
        title: input.title,
        description: input.description ?? null,
        severity: input.severity,
        status: input.status,
        service: input.service ?? null,
        errorSignature: input.errorSignature ?? null,
        affectedComponents: input.affectedComponents,
        environment: input.environment ?? null,
        fingerprint,
        startedAt: new Date(input.startedAt),
        detectedAt: input.detectedAt ? new Date(input.detectedAt) : null,
        resolvedAt: input.resolvedAt ? new Date(input.resolvedAt) : null,
        createdBy: actorId,
      });

      await events.append({
        projectId,
        type: 'incident.created',
        entityType: 'incident',
        entityId: row.id,
        actorId,
        occurredAt,
        idempotencyKey: input.idempotencyKey,
        payload: {
          title: row.title,
          severity: row.severity,
          status: row.status,
          service: row.service,
          fingerprint: row.fingerprint,
        },
      });

      return { ...toIncidentDto(row), replayed: false };
    },

    async list(projectId, filters) {
      const cursorParts = filters.cursor ? decodeCursor(filters.cursor) : [];
      const rows = await repo.list(projectId, {
        ...filters,
        cursorValue: cursorParts[0],
        cursorId: cursorParts[1],
      });

      const hasMore = rows.length > filters.limit;
      const page = hasMore ? rows.slice(0, filters.limit) : rows;
      const last = page[page.length - 1];

      return {
        items: page.map(toIncidentDto),
        nextCursor:
          hasMore && last
            ? encodeCursor([sortValueOf(last, filters.sort as IncidentSortKey), last.id])
            : null,
      };
    },

    async get(projectId, incidentId) {
      const row = await repo.findById(projectId, incidentId);
      if (!row) throw AppError.notFound('Incident', incidentId);
      return toIncidentDto(row);
    },
  };
}

export type { IncidentSortKey, SortOrder };
