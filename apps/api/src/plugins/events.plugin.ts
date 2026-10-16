import fp from 'fastify-plugin';
import { createEventsService } from '../modules/events/events.service';

/**
 * Exposes the append-only event store to every other module as `app.events`.
 * Services call `app.events.append(...)` inside their own transaction-free flow;
 * the store itself guarantees one row per (project, idempotency key).
 */
export const eventsPlugin = fp(
  async (app) => {
    app.decorate('events', createEventsService(app.db, app.config.LATE_EVENT_THRESHOLD_MS));
  },
  { name: 'traceback-events', dependencies: ['traceback-db'] },
);
