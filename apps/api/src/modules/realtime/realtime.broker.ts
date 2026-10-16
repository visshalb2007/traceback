import { createDbClient } from '../../db/client';

/** The notification payload the `events_notify_trigger` publishes. */
export interface RealtimeEvent {
  projectId: string;
  eventId: string;
  sequence: number;
  type: string;
  occurredAt: string;
}

export type RealtimeListener = (event: RealtimeEvent) => void;

const DEFAULT_CHANNEL = 'traceback_events';

/**
 * Parse a `pg_notify` payload defensively. Anything malformed is dropped rather
 * than thrown, because a bad notification must never take down a live stream.
 * Pure and exported so it can be unit-tested without a database.
 */
export function parseNotification(payload: string): RealtimeEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(payload);
  } catch {
    return null;
  }

  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;

  const { projectId, eventId, sequence, type, occurredAt } = record;
  if (
    typeof projectId !== 'string' ||
    typeof eventId !== 'string' ||
    typeof sequence !== 'number' ||
    typeof type !== 'string' ||
    typeof occurredAt !== 'string'
  ) {
    return null;
  }

  return { projectId, eventId, sequence, type, occurredAt };
}

export interface RealtimeBroker {
  /** Register a listener for one project. Returns an unsubscribe function. */
  subscribe(projectId: string, listener: RealtimeListener): () => void;
  /** How many listeners are attached (used by tests and metrics). */
  subscriberCount(projectId: string): number;
  close(): Promise<void>;
}

export interface RealtimeBrokerOptions {
  databaseUrl: string;
  channel?: string;
  log?: { warn: (obj: unknown, message: string) => void };
}

/**
 * One LISTEN connection per process, fanned out to in-memory subscribers.
 *
 * The connection is opened lazily on the first subscriber, so booting the app (or
 * running the test suite) never touches Postgres until someone actually asks for a
 * stream. If the connection cannot be established we log and keep the subscriber
 * alive — a client can still receive its replayed backlog, just not live updates.
 */
export function createRealtimeBroker(options: RealtimeBrokerOptions): RealtimeBroker {
  const channel = options.channel ?? DEFAULT_CHANNEL;
  const subscribers = new Map<string, Set<RealtimeListener>>();

  let handle: ReturnType<typeof createDbClient> | undefined;
  let starting: Promise<void> | undefined;

  const dispatch = (payload: string): void => {
    const event = parseNotification(payload);
    if (!event) return;
    for (const listener of subscribers.get(event.projectId) ?? []) {
      try {
        listener(event);
      } catch (error) {
        options.log?.warn({ err: error }, 'realtime listener threw');
      }
    }
  };

  const ensureListening = (): Promise<void> => {
    starting ??= (async () => {
      try {
        handle = createDbClient(options.databaseUrl, { maxConnections: 1, idleTimeoutSeconds: 60 });
        await handle.sql.listen(channel, dispatch);
      } catch (error) {
        options.log?.warn({ err: error }, 'failed to start realtime listener');
        handle = undefined;
        starting = undefined;
      }
    })();

    return starting;
  };

  return {
    subscribe(projectId, listener) {
      let listeners = subscribers.get(projectId);
      if (!listeners) {
        listeners = new Set();
        subscribers.set(projectId, listeners);
      }
      listeners.add(listener);

      void ensureListening();

      return () => {
        const set = subscribers.get(projectId);
        if (!set) return;
        set.delete(listener);
        if (set.size === 0) subscribers.delete(projectId);
      };
    },

    subscriberCount(projectId) {
      return subscribers.get(projectId)?.size ?? 0;
    },

    async close() {
      subscribers.clear();
      const current = handle;
      handle = undefined;
      starting = undefined;
      if (current) await current.close();
    },
  };
}
