'use client';

import type { TimelineItem } from '@traceback/shared';
import { API_BASE_URL, apiRequest } from './api-client';
import { getSession } from './session';

/**
 * The browser's `EventSource` cannot attach an `Authorization` header, so the SSE
 * endpoint is consumed with `fetch` + a stream reader instead. That also lets us
 * resume precisely: the numeric `id` of every frame is remembered and replayed to
 * the server as `lastEventId`, which the API uses to send only the backlog we missed.
 */
export type StreamStatus = 'connecting' | 'open' | 'error' | 'closed';

export interface ProjectStreamHandlers {
  onEvent: (item: TimelineItem) => void;
  onStatus?: (status: StreamStatus) => void;
}

export interface ProjectStream {
  close: () => void;
}

const RECONNECT_MS = 5000;

export function openProjectStream(
  projectId: string,
  handlers: ProjectStreamHandlers,
  initialLastEventId?: number,
): ProjectStream {
  const controller = new AbortController();
  let closed = false;
  let lastEventId = initialLastEventId;

  const setStatus = (status: StreamStatus): void => handlers.onStatus?.(status);

  const streamUrl = (): string => {
    const url = new URL(`${API_BASE_URL}/api/v1/projects/${projectId}/stream`);
    if (lastEventId !== undefined) url.searchParams.set('lastEventId', String(lastEventId));
    return url.toString();
  };

  const headers = (): Record<string, string> => {
    const session = getSession();
    return {
      accept: 'text/event-stream',
      ...(session ? { authorization: `Bearer ${session.accessToken}` } : {}),
    };
  };

  function handleBlock(block: string): void {
    let id: number | undefined;
    let data = '';
    for (const line of block.split('\n')) {
      if (line.startsWith(':')) continue;
      if (line.startsWith('id:')) {
        const parsed = Number(line.slice(3).trim());
        if (Number.isInteger(parsed) && parsed >= 0) id = parsed;
      } else if (line.startsWith('data:')) {
        data += line.slice(5).trimStart();
      }
    }
    if (!data) return;
    try {
      const item = JSON.parse(data) as TimelineItem;
      if (id !== undefined) lastEventId = id;
      handlers.onEvent(item);
    } catch {
      // A malformed frame must never tear the stream down.
    }
  }

  async function connect(): Promise<void> {
    setStatus('connecting');
    if (!getSession()) {
      setStatus('error');
      return;
    }

    let response = await fetch(streamUrl(), { headers: headers(), signal: controller.signal });

    // A stale access token is recovered the same way REST calls recover: refresh,
    // then retry the stream exactly once.
    if (response.status === 401) {
      const refreshed = await apiRequest<unknown>('/api/v1/auth/me')
        .then(() => true)
        .catch(() => false);
      if (refreshed) {
        response = await fetch(streamUrl(), { headers: headers(), signal: controller.signal });
      }
    }

    if (!response.ok || !response.body) throw new Error(`stream failed: ${response.status}`);
    setStatus('open');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        handleBlock(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf('\n\n');
      }
    }
  }

  async function run(): Promise<void> {
    while (!closed) {
      try {
        await connect();
      } catch {
        if (closed || controller.signal.aborted) break;
        setStatus('error');
      }
      if (closed) break;
      await new Promise((resolve) => setTimeout(resolve, RECONNECT_MS));
    }
  }

  void run();

  return {
    close: () => {
      if (closed) return;
      closed = true;
      controller.abort();
      setStatus('closed');
    },
  };
}
