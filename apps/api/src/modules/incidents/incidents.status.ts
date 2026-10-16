import { canTransitionStatus, type IncidentStatus } from '@traceback/shared';
import type { IncidentRow } from '../../db/schema';
import { AppError } from '../../lib/errors';
import type { IncidentPatch } from './incidents.repository';

export type IncidentLifecycleEvent =
  'incident.status_changed' | 'incident.resolved' | 'incident.reopened';

export interface StatusChangePlan {
  patch: Omit<IncidentPatch, 'updatedAt'>;
  eventType: IncidentLifecycleEvent;
}

const REOPENED_FROM: readonly IncidentStatus[] = ['resolved', 'closed'];
const REOPENED_TO: readonly IncidentStatus[] = ['open', 'investigating', 'mitigated'];

/**
 * Turns "move this incident to `to`" into the concrete row patch and the event type
 * that describes it. State-machine validation lives in @traceback/shared so the API
 * and UI can never disagree about which transitions are legal.
 *
 * Resolution bookkeeping is derived here rather than trusted from the client:
 * resolving stamps `resolved_at`/`resolved_by`; reopening clears them; every other
 * move leaves them untouched.
 */
export function planStatusChange(
  row: IncidentRow,
  to: IncidentStatus,
  actorId: string | null,
  note: string | undefined,
  now: Date,
): StatusChangePlan {
  if (!canTransitionStatus(row.status, to)) {
    throw AppError.invalidTransition(row.status, to);
  }

  const reopening = REOPENED_FROM.includes(row.status) && REOPENED_TO.includes(to);
  const patch: Omit<IncidentPatch, 'updatedAt'> = { status: to };

  if (reopening) {
    patch.resolvedAt = null;
    patch.resolvedBy = null;
    patch.resolution = null;
  } else if (to === 'resolved') {
    patch.resolvedAt = now;
    patch.resolvedBy = actorId;
    patch.resolution = note ?? row.resolution;
  }

  const eventType: IncidentLifecycleEvent =
    to === 'resolved'
      ? 'incident.resolved'
      : reopening
        ? 'incident.reopened'
        : 'incident.status_changed';

  return { patch, eventType };
}

/** Human-readable timeline summary for a lifecycle event. */
export function describeStatusChange(from: IncidentStatus, to: IncidentStatus): string {
  return `Status changed from ${from} to ${to}`;
}
