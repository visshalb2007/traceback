import type {
  ChangeIncidentStatusInput,
  CreateIncidentInput,
  Incident,
  IncidentCommentInput,
  IncidentFingerprintGroup,
  IncidentUpdate,
  IncidentUpdateKind,
  RecurringIncidentQuery,
  UpdateIncidentInput,
} from '@traceback/shared';
import type { Database } from '../../db/client';
import type { IncidentRow, IncidentUpdateRow } from '../../db/schema';
import { AppError } from '../../lib/errors';
import { encodeCursor, decodeCursor } from '../../lib/cursor';
import { diffFields, threeWayMerge } from '../../lib/merge';
import type { AuditContext } from '../audit/audit.service';
import { writeAudit } from '../audit/audit.service';
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
  type RecurringFingerprintRow,
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

/** Map the GROUP BY row into the wire shape for the recurring-issues endpoint. */
export function toFingerprintGroupDto(row: RecurringFingerprintRow): IncidentFingerprintGroup {
  return {
    fingerprint: row.fingerprint,
    title: row.title,
    service: row.service,
    severity: row.severity,
    count: row.count,
    activeCount: row.active_count,
    firstSeenAt: row.first_seen_at.toISOString(),
    lastSeenAt: row.last_seen_at.toISOString(),
    incidentIds: row.incident_ids,
  };
}

export function toIncidentUpdateDto(
  row: IncidentUpdateRow,
  authorName: string | null,
): IncidentUpdate {
  return {
    id: row.id,
    incidentId: row.incidentId,
    authorId: row.authorId,
    authorName,
    kind: row.kind as IncidentUpdateKind,
    body: row.body,
    occurredAt: row.occurredAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
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
    context?: AuditContext,
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
    context?: AuditContext,
  ): Promise<Incident>;
  changeStatus(
    projectId: string,
    incidentId: string,
    input: ChangeIncidentStatusInput,
    actorId: string | null,
    context?: AuditContext,
  ): Promise<Incident>;
  addComment(
    projectId: string,
    incidentId: string,
    input: IncidentCommentInput,
    actorId: string | null,
    context?: AuditContext,
  ): Promise<IncidentUpdate>;
  listUpdates(projectId: string, incidentId: string): Promise<IncidentUpdate[]>;
  listRecurringFingerprints(
    projectId: string,
    filters: RecurringIncidentQuery,
  ): Promise<IncidentFingerprintGroup[]>;
}

export function createIncidentsService(db: Database, events: EventsService): IncidentsService {
  const repo: IncidentsRepository = createIncidentsRepository(db);
  const updatesRepo = createIncidentUpdatesRepository(db);

  return {
    async create(projectId, input, actorId, context) {
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

      // The row, its event and its audit entry share one transaction: a failed
      // audit write rolls the incident back rather than leaving a silent change.
      const row = await db.transaction(async (tx) => {
        const txRepo = createIncidentsRepository(tx);
        const inserted = await txRepo.insert({
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

        await events.append(
          {
            projectId,
            type: 'incident.created',
            entityType: 'incident',
            entityId: inserted.id,
            actorId,
            occurredAt,
            idempotencyKey: input.idempotencyKey,
            payload: {
              ...snapshotIncident(inserted),
              status: inserted.status,
              fingerprint: inserted.fingerprint,
            },
          },
          tx,
        );

        // Same fingerprint as an earlier incident means the problem came back; the
        // recurrence is worth its own event so the timeline can show "seen before".
        const previous = await txRepo.listByFingerprint(
          projectId,
          inserted.fingerprint,
          inserted.id,
        );
        if (previous.length > 0) {
          await events.append(
            {
              projectId,
              type: 'fingerprint.grouped',
              entityType: 'incident',
              entityId: inserted.id,
              actorId,
              occurredAt,
              payload: {
                fingerprint: inserted.fingerprint,
                occurrences: previous.length,
                firstSeenAt: previous[previous.length - 1]?.startedAt.toISOString() ?? null,
              },
            },
            tx,
          );
        }

        await writeAudit(tx, {
          projectId,
          actorId,
          action: 'create',
          entityType: 'incident',
          entityId: inserted.id,
          after: snapshotIncident(inserted),
          ip: context?.ip,
          userAgent: context?.userAgent,
        });

        return inserted;
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

    async update(projectId, incidentId, input, actorId, context) {
      const updated = await db.transaction(async (tx) => {
        const txRepo = createIncidentsRepository(tx);
        const existing = await txRepo.findById(projectId, incidentId);
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

        const row = await txRepo.update(projectId, incidentId, dbPatch, existing.rowVersion);
        if (!row) {
          throw AppError.versionConflict('Incident was modified by someone else', {
            expectedRowVersion: existing.rowVersion,
          });
        }

        await events.append(
          {
            projectId,
            type:
              row.severity !== existing.severity ? 'incident.severity_changed' : 'incident.updated',
            entityType: 'incident',
            entityId: incidentId,
            actorId,
            occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
            idempotencyKey: input.idempotencyKey,
            payload: {
              ...snapshotIncident(row),
              changes: diffFields(snapshotIncident(existing), applied),
            },
          },
          tx,
        );

        await writeAudit(tx, {
          projectId,
          actorId,
          action: 'update',
          entityType: 'incident',
          entityId: incidentId,
          before: snapshotIncident(existing),
          after: snapshotIncident(row),
          ip: context?.ip,
          userAgent: context?.userAgent,
        });

        return row;
      });

      return toIncidentDto(updated);
    },

    async changeStatus(projectId, incidentId, input, actorId, context) {
      const now = new Date();

      const updated = await db.transaction(async (tx) => {
        const txRepo = createIncidentsRepository(tx);
        const existing = await txRepo.findById(projectId, incidentId);
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

        const { patch, eventType } = planStatusChange(
          existing,
          input.status,
          actorId,
          input.note,
          now,
        );

        const row = await txRepo.update(
          projectId,
          incidentId,
          { ...patch, updatedAt: now },
          existing.rowVersion,
        );
        if (!row) {
          throw AppError.versionConflict('Incident was modified by someone else', {
            expectedRowVersion: existing.rowVersion,
          });
        }

        // A note attached to a transition is part of the record, so it is stored in
        // the same append-only stream as free comments.
        if (input.note) {
          const txUpdates = createIncidentUpdatesRepository(tx);
          await txUpdates.insert({
            incidentId,
            authorId: actorId,
            kind: input.status === 'resolved' ? 'resolution_note' : 'timeline_note',
            body: input.note,
          });
        }

        await events.append(
          {
            projectId,
            type: eventType,
            entityType: 'incident',
            entityId: incidentId,
            actorId,
            occurredAt: input.occurredAt ? new Date(input.occurredAt) : now,
            idempotencyKey: input.idempotencyKey,
            payload: {
              ...snapshotIncident(row),
              status: row.status,
              fromStatus: existing.status,
              note: input.note ?? null,
            },
          },
          tx,
        );

        await writeAudit(tx, {
          projectId,
          actorId,
          action: 'status_change',
          entityType: 'incident',
          entityId: incidentId,
          before: { status: existing.status },
          after: { status: row.status },
          ip: context?.ip,
          userAgent: context?.userAgent,
        });

        return row;
      });

      return toIncidentDto(updated);
    },

    async addComment(projectId, incidentId, input, actorId, context) {
      const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();

      const inserted = await db.transaction(async (tx) => {
        const txRepo = createIncidentsRepository(tx);
        const incident = await txRepo.findById(projectId, incidentId);
        if (!incident) throw AppError.notFound('Incident', incidentId);

        const txUpdates = createIncidentUpdatesRepository(tx);
        const comment = await txUpdates.insert({
          incidentId,
          authorId: actorId,
          kind: input.kind,
          body: input.body,
          occurredAt,
        });

        await events.append(
          {
            projectId,
            type: 'incident.update_added',
            entityType: 'incident',
            entityId: incidentId,
            actorId,
            occurredAt,
            idempotencyKey: input.idempotencyKey,
            payload: { updateId: comment.id, kind: comment.kind },
          },
          tx,
        );

        await writeAudit(tx, {
          projectId,
          actorId,
          action: 'update',
          entityType: 'incident_update',
          entityId: comment.id,
          after: { kind: comment.kind, body: comment.body },
          ip: context?.ip,
          userAgent: context?.userAgent,
        });

        return comment;
      });

      // The comment page needs the author's display name, which the write path does
      // not otherwise have to hand.
      const withAuthor = await updatesRepo.findByIdWithAuthor(incidentId, inserted.id);
      return toIncidentUpdateDto(inserted, withAuthor?.authorName ?? null);
    },

    async listUpdates(projectId, incidentId) {
      const incident = await repo.findById(projectId, incidentId);
      if (!incident) throw AppError.notFound('Incident', incidentId);

      const rows = await updatesRepo.listByIncident(incidentId);
      // Author names are resolved per row; the list is intentionally unpaginated
      // because an incident's discussion is bounded in practice.
      return Promise.all(
        rows.map(async (row) => {
          const withAuthor = await updatesRepo.findByIdWithAuthor(incidentId, row.id);
          return toIncidentUpdateDto(row, withAuthor?.authorName ?? null);
        }),
      );
    },

    async listRecurringFingerprints(projectId, filters) {
      const rows = await repo.listRecurringFingerprints(
        projectId,
        filters.minIncidents,
        filters.limit,
      );
      return rows.map(toFingerprintGroupDto);
    },
  };
}

export type { IncidentSortKey, SortOrder };
