import { z } from 'zod';
import type { TimelineItem } from '@traceback/shared';
import type { AppServer } from '../../types';
import { createRealtimeService } from './realtime.service';
import { projectIdParamSchema } from '../projects/projects.routes';

const streamQuerySchema = z.object({
  /** Alternative to the `Last-Event-ID` header for clients that cannot set headers. */
  lastEventId: z.coerce.number().int().nonnegative().optional(),
});

const HEARTBEAT_MS = 25_000;
const REPLAY_LIMIT = 500;

/**
 * Resolve the resume point from the `Last-Event-ID` header or the `lastEventId`
 * query parameter (query wins). Pure so the parsing rules are unit-tested: a
 * malformed value means "no resume", never "replay from zero".
 */
export function resolveLastEventId(
  header: string | string[] | undefined,
  query: number | undefined,
): number | undefined {
  if (query !== undefined) return query;
  const value = Array.isArray(header) ? header[0] : header;
  if (value === undefined || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

export async function realtimeRoutes(app: AppServer): Promise<void> {
  const service = createRealtimeService(app.db);

  app.get(
    '/projects/:projectId/stream',
    {
      preHandler: [app.requireAuth, app.authorize('timeline:read')],
      schema: { params: projectIdParamSchema, querystring: streamQuerySchema },
    },
    async (request, reply) => {
      const { projectId } = request.params;
      const raw = reply.raw;

      // Take over the socket: Fastify must not try to serialise a reply body.
      reply.hijack();
      raw.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      });
      // Tell the browser's EventSource how long to wait before reconnecting.
      raw.write('retry: 5000\n\n');

      const send = (item: TimelineItem): void => {
        raw.write(`id: ${item.sequence}\n`);
        raw.write(`event: ${item.type}\n`);
        raw.write(`data: ${JSON.stringify(item)}\n\n`);
      };

      const lastEventId = resolveLastEventId(
        request.headers['last-event-id'],
        request.query.lastEventId,
      );

      // Replay the backlog before subscribing, so no event is duplicated or lost
      // between the replay and the live subscription.
      if (lastEventId !== undefined) {
        try {
          for (const item of await service.backlog(projectId, lastEventId, REPLAY_LIMIT)) {
            send(item);
          }
        } catch (error) {
          request.log.warn({ err: error }, 'failed to replay stream backlog');
        }
      }

      const unsubscribe = app.realtime.subscribe(projectId, (event) => {
        void service
          .load(projectId, event.eventId)
          .then((item) => {
            if (item) send(item);
          })
          .catch((error: unknown) => {
            request.log.warn({ err: error }, 'failed to load streamed event');
          });
      });

      const heartbeat = setInterval(() => raw.write(': ping\n\n'), HEARTBEAT_MS);

      let closed = false;
      const cleanup = (): void => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
      };

      request.raw.on('close', cleanup);
      raw.on('error', cleanup);
    },
  );
}
