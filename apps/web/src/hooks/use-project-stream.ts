'use client';

import type { TimelineItem } from '@traceback/shared';
import { useEffect, useRef, useState } from 'react';
import { openProjectStream, type StreamStatus } from '@/lib/event-stream';

/**
 * Subscribes to a project's event stream for as long as the component is mounted.
 * The callback is held in a ref so a re-render never tears the connection down.
 */
export function useProjectStream(
  projectId: string | undefined,
  onEvent: (item: TimelineItem) => void,
): StreamStatus {
  const [status, setStatus] = useState<StreamStatus>('connecting');
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    if (!projectId) return undefined;
    const stream = openProjectStream(projectId, {
      onEvent: (item) => handler.current(item),
      onStatus: setStatus,
    });
    return () => stream.close();
  }, [projectId]);

  return status;
}
