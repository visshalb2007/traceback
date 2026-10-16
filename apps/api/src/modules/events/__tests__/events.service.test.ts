import { describe, expect, it } from 'vitest';
import { deriveIdempotencyKey, isLateEvent } from '../events.service';

const THRESHOLD = 5 * 60 * 1000;

describe('isLateEvent', () => {
  const received = new Date('2026-01-01T12:00:00.000Z');

  it('is not late for an event that just happened', () => {
    expect(isLateEvent(received, received, THRESHOLD)).toBe(false);
  });

  it('is not late just inside the threshold', () => {
    const occurred = new Date(received.getTime() - THRESHOLD);
    expect(isLateEvent(occurred, received, THRESHOLD)).toBe(false);
  });

  it('is late one millisecond past the threshold', () => {
    const occurred = new Date(received.getTime() - THRESHOLD - 1);
    expect(isLateEvent(occurred, received, THRESHOLD)).toBe(true);
  });

  it('is late for an event backdated by an hour', () => {
    const occurred = new Date(received.getTime() - 60 * 60 * 1000);
    expect(isLateEvent(occurred, received, THRESHOLD)).toBe(true);
  });

  it('is not late for an event claiming a future timestamp', () => {
    const occurred = new Date(received.getTime() + 1000);
    expect(isLateEvent(occurred, received, THRESHOLD)).toBe(false);
  });

  it('treats a zero threshold as "anything in the past is late"', () => {
    const occurred = new Date(received.getTime() - 1);
    expect(isLateEvent(occurred, received, 0)).toBe(true);
  });
});

describe('deriveIdempotencyKey', () => {
  it('is stable for identical inputs', () => {
    const occurredAt = new Date('2026-01-01T00:00:00.000Z');
    const input = {
      type: 'deployment.recorded' as const,
      entityType: 'deployment' as const,
      entityId: '11111111-1111-1111-1111-111111111111',
      occurredAt,
    };
    expect(deriveIdempotencyKey(input)).toBe(deriveIdempotencyKey({ ...input }));
  });

  it('varies with the timestamp so genuinely different events are not merged', () => {
    const base = {
      type: 'incident.created' as const,
      entityType: 'incident' as const,
      entityId: '11111111-1111-1111-1111-111111111111',
    };
    const a = deriveIdempotencyKey({ ...base, occurredAt: new Date('2026-01-01T00:00:00.000Z') });
    const b = deriveIdempotencyKey({ ...base, occurredAt: new Date('2026-01-01T00:00:01.000Z') });
    expect(a).not.toBe(b);
  });
});
