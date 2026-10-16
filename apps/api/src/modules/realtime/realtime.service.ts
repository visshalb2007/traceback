import type { TimelineItem } from '@traceback/shared';
import type { DbExecutor } from '../../db/client';
import { createEventsRepository } from '../events/events.repository';
import { toTimelineItem } from '../timeline/timeline.service';

export interface RealtimeService {
  /** Replay events the client missed, oldest first, in write order. */
  backlog(projectId: string, afterSequence: number, limit: number): Promise<TimelineItem[]>;
  /** Load one event (the live-notification path) as a timeline item. */
  load(projectId: string, eventId: string): Promise<TimelineItem | undefined>;
}

/**
 * Read model for the SSE stream. Keeping it here (rather than querying in the
 * route) preserves the routes -> service -> repository layering, and lets the
 * stream reuse the exact timeline projection the REST timeline uses.
 */
export function createRealtimeService(db: DbExecutor): RealtimeService {
  const repo = createEventsRepository(db);

  return {
    async backlog(projectId, afterSequence, limit) {
      const rows = await repo.listAfterSequence(projectId, afterSequence, limit);
      return rows.map((event) => toTimelineItem({ event, actorName: null }));
    },

    async load(projectId, eventId) {
      const row = await repo.findById(projectId, eventId);
      return row ? toTimelineItem({ event: row, actorName: null }) : undefined;
    },
  };
}
