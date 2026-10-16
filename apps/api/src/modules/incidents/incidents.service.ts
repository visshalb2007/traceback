import type {
  ChangeIncidentStatusInput,
  CreateIncidentInput,
  Incident,
  UpdateIncidentInput,
} from '@traceback/shared';
import type { Database } from '../../db/client';
import type { IncidentRow } from '../../db/schema';
import { AppError } from '../../lib/errors';
import { encodeCursor, decodeCursor } from '../../lib/cursor';
import { diffFields, threeWayMerge } from '../../lib/merge';
import type { EventsService } from '../events/events.service';
import { createIncidentUpdatesRepository } from './incident-updates.repository';
import { computeFingerprint } from './fingerprint';
import { planStatusChange } from './incidents.status';
import {
  createIncidentsRepository,
  type IncidentListFilters,
  type IncidentPatch,
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

/**
 * The mutable fields that participate in three-way merges, flattened into a plain
 * record. Every incident event stores this snapshot (plus `rowVersion`) so a later
 * conflict can be resolved against the exact state the caller started from.
 */
export function snapshotIncident(row: IncidentRow): Record<string, unknown> {
  return {
    title: row.title,
    description: row.description,
    severity: row.severity,
    service: row.service,
    errorSignature: row.errorSignature,
    affectedComponents: row.affectedComponents,
    environment: row.environment,
    rowVersion: row.rowVersion,
  };
}

/** Whitelist the client patch down to the mergeable fields. */
export function incidentPatch(input: UpdateIncidentInput): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.description !== undefined) patch.description = input.description;
  if (input.severity !== undefined) patch.severity = input.severity;
  if (input.service !== undefined) patch.service = input.service;
  if (input.errorSignature !== undefined) patch.errorSignature = input.errorSignature;
  if (input.affectedComponents !== undefined) patch.affectedComponents = input.affectedComponents;
  if (input.environment !== undefined) patch.environment = input.environment;
  return patch;
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
  update(
    projectId: string,
    incidentId: string,
    input: UpdateIncidentInput,
    actorId: string | null,
  ): Promise<Incident>;
  changeStatus(
    projectId: string,
    incidentId: string,
    input: ChangeIncidentStatusInput,
    actorId: string | null,
  ): Promise<Incident>;
}

export function createIncidentsService(db: Database, events: EventsService): IncidentsService {
  const repo: IncidentsRepository = createIncidentsRepository(db);
  const updatesRepo = createIncidentUpdatesRepository(db);

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
          ...snapshotIncident(row),
          status: row.status,
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

    async update(projectId, incidentId, input, actorId) {
      const existing = await repo.findById(projectId, incidentId);
      if (!existing) throw AppError.notFound('Incident', incidentId);

      const patch = incidentPatch(input);
      let applied = patch;

      // Optimistic concurrency only bites when the caller declares the version they
      // edited. When it has moved on, we recover the caller's base snapshot from the
      // event that carried that version and three-way merge, so edits to *different*
      // fields still succeed and only genuine clashes raise a 409.
      if (
        input.expectedRowVersion !== undefined &&
        input.expectedRowVersion !== existing.rowVersion
      ) {
        const history = await events.listForEntity(projectId, 'incident', incidentId);
        const baseEvent = history.find(
          (event) => event.payload.rowVersion === input.expectedRowVersion,
        );

        if (!baseEvent) {
          throw AppError.versionConflict('Incident changed since you loaded it', {
            expectedRowVersion: input.expectedRowVersion,
            currentRowVersion: existing.rowVersion,
            fieldDiff: diffFields(snapshotIncident(existing), patch),
          });
        }

        const { merged, conflicts } = threeWayMerge(
          baseEvent.payload,
          patch,
          snapshotIncident(existing),
        );
        if (conflicts.length > 0) {
          throw AppError.versionConflict('Your changes conflict with a concurrent edit', {
            expectedRowVersion: input.expectedRowVersion,
            currentRowVersion: existing.rowVersion,
            conflicts,
            current: toIncidentDto(existing),
          });
        }
        applied = merged;
      }

      // Fingerprint inputs may have moved; keep the recurring-issue identity honest.
      const fingerprintInputsChanged =
        'title' in applied || 'service' in applied || 'errorSignature' in applied;
      const nextFingerprint = fingerprintInputsChanged
        ? computeFingerprint({
            title: (applied.title as string | undefined) ?? existing.title,
            service: (applied.service as string | null | undefined) ?? existing.service,
            errorSignature:
              (applied.errorSignature as string | null | undefined) ?? existing.errorSignature,
          })
        : existing.fingerprint;

      // `applied` only ever contains whitelisted columns (patch is built from the
      // Zod-checked input, and merge output is a subset of patch ∪ base snapshot).
      const dbPatch = {
        ...(applied as unknown as Omit<IncidentPatch, 'updatedAt'>),
        fingerprint: nextFingerprint,
        updatedAt: new Date(),
      } satisfies IncidentPatch;

      const updated = await repo.update(projectId, incidentId, dbPatch, existing.rowVersion);
      if (!updated) {
        throw AppError.versionConflict('Incident was modified by someone else', {
          expectedRowVersion: existing.rowVersion,
        });
      }

      const severityChanged = updated.severity !== existing.severity;
      await events.append({
        projectId,
        type: severityChanged ? 'incident.severity_changed' : 'incident.updated',
        entityType: 'incident',
        entityId: incidentId,
        actorId,
        occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
        idempotencyKey: input.idempotencyKey,
        payload: {
          ...snapshotIncident(updated),
          changes: diffFields(snapshotIncident(existing), applied),
        },
      });

      return toIncidentDto(updated);
    },

    async changeStatus(projectId, incidentId, input, actorId) {
      const existing = await repo.findById(projectId, incidentId);
      if (!existing) throw AppError.notFound('Incident', incidentId);

      if (
        input.expectedRowVersion !== undefined &&
        input.expectedRowVersion !== existing.rowVersion
      ) {
        throw AppError.versionConflict('Incident changed since you loaded it', {
          expectedRowVersion: input.expectedRowVersion,
          currentRowVersion: existing.rowVersion,
          current: toIncidentDto(existing),
        });
      }

      const now = new Date();
      const { patch, eventType } = planStatusChange(
        existing,
        input.status,
        actorId,
        input.note,
        now,
      );

      const updated = await repo.update(
        projectId,
        incidentId,
        { ...patch, updatedAt: now },
        existing.rowVersion,
      );
      if (!updated) {
        throw AppError.versionConflict('Incident was modified by someone else', {
          expectedRowVersion: existing.rowVersion,
        });
      }

      // A note attached to a transition is part of the record, so it is stored in
      // the same append-only stream as free comments.
      if (input.note) {
        await updatesRepo.insert({
          incidentId,
          authorId: actorId,
          kind: input.status === 'resolved' ? 'resolution_note' : 'timeline_note',
          body: input.note,
        });
      }

      await events.append({
        projectId,
        type: eventType,
        entityType: 'incident',
        entityId: incidentId,
        actorId,
        occurredAt: input.occurredAt ? new Date(input.occurredAt) : now,
        idempotencyKey: input.idempotencyKey,
        payload: {
          ...snapshotIncident(updated),
          status: updated.status,
          fromStatus: existing.status,
          note: input.note ?? null,
        },
      });

      return toIncidentDto(updated);
    },
  };
}

export type { IncidentSortKey, SortOrder };
