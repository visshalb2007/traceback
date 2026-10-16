import type { EventType, TimelineItem } from '@traceback/shared';
import type { DbExecutor } from '../../db/client';
import { encodeCursor, decodeCursor } from '../../lib/cursor';
import { toEventDto } from '../events/events.service';
import {
  createTimelineRepository,
  type TimelineFilters,
  type TimelineRepository,
} from './timeline.repository';

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

/**
 * A timeline is only useful if a human can scan it, so every event type gets a
 * one-line summary derived from its payload. Pure and exported so it is
 * unit-tested without a database; unknown types fall back to a readable label.
 */
export function summarizeEvent(type: EventType, payload: Record<string, unknown>): string {
  switch (type) {
    case 'project.created':
      return `Project created (${asString(payload.slug) ?? 'unknown slug'})`;
    case 'project.updated':
      return 'Project settings updated';
    case 'project.deleted':
      return 'Project deleted';
    case 'member.added':
      return `Member added as ${asString(payload.role) ?? 'member'}`;
    case 'member.role_changed':
      return `Role changed from ${asString(payload.from) ?? '?'} to ${asString(payload.to) ?? '?'}`;
    case 'member.removed':
      return 'Member removed';
    case 'deployment.recorded':
      return `Deployment started: ${asString(payload.service) ?? 'service'} → ${asString(payload.environment) ?? 'environment'}`;
    case 'deployment.enriched':
      return `Deployment updated: ${asString(payload.status) ?? 'unknown status'}`;
    case 'change.recorded':
      return `Change recorded (${asString(payload.sha)?.slice(0, 7) ?? 'unknown'})`;
    case 'incident.created':
      return `Incident opened: ${asString(payload.title) ?? 'untitled'}`;
    case 'incident.updated':
      return 'Incident details updated';
    case 'incident.severity_changed':
      return `Severity set to ${asString(payload.severity) ?? 'unknown'}`;
    case 'incident.status_changed':
      return `Status changed from ${asString(payload.fromStatus) ?? '?'} to ${asString(payload.status) ?? '?'}`;
    case 'incident.resolved':
      return 'Incident resolved';
    case 'incident.reopened':
      return 'Incident reopened';
    case 'incident.assignee_added':
      return 'Responder assigned';
    case 'incident.assignee_removed':
      return 'Responder unassigned';
    case 'incident.update_added':
      return asString(payload.kind) === 'resolution_note'
        ? 'Resolution note added'
        : 'Comment added';
    case 'incident.link_added':
      return 'Suspect linked to incident';
    case 'incident.link_confirmed':
      return 'Suspect link confirmed';
    case 'incident.link_rejected':
      return 'Suspect link rejected';
    case 'correlation.suggested':
      return 'Correlation suggestion recorded';
    case 'fingerprint.grouped':
      return 'Recurring issue grouped';
    default:
      return type;
  }
}

export function toTimelineItem(row: {
  event: Parameters<typeof toEventDto>[0];
  actorName: string | null;
}): TimelineItem {
  const event = toEventDto(row.event);
  return {
    id: event.id,
    sequence: event.sequence,
    projectId: event.projectId,
    type: event.type,
    entityType: event.entityType,
    entityId: event.entityId,
    actorId: event.actorId,
    actorName: row.actorName,
    payload: event.payload,
    summary: summarizeEvent(event.type, event.payload),
    occurredAt: event.occurredAt,
    receivedAt: event.receivedAt,
    isLate: event.isLate,
    source: event.source,
  };
}

export interface TimelineResult {
  items: TimelineItem[];
  nextCursor: string | null;
}

export interface TimelineService {
  list(
    projectId: string,
    filters: Omit<TimelineFilters, 'cursorOccurredAt' | 'cursorSequence'> & {
      cursor?: string | undefined;
    },
  ): Promise<TimelineResult>;
}

export function createTimelineService(db: DbExecutor): TimelineService {
  const repo: TimelineRepository = createTimelineRepository(db);

  return {
    async list(projectId, filters) {
      const cursorParts = filters.cursor ? decodeCursor(filters.cursor) : [];
      const rows = await repo.list(projectId, {
        ...filters,
        cursorOccurredAt: cursorParts[0],
        cursorSequence: cursorParts[1],
      });

      const hasMore = rows.length > filters.limit;
      const page = hasMore ? rows.slice(0, filters.limit) : rows;
      const last = page[page.length - 1];

      return {
        items: page.map(toTimelineItem),
        nextCursor:
          hasMore && last
            ? encodeCursor([last.event.occurredAt.toISOString(), String(last.event.sequence)])
            : null,
      };
    },
  };
}
