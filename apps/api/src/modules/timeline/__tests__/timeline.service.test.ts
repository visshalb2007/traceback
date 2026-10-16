import { describe, expect, it } from 'vitest';
import type { EventRow } from '../../../db/schema';
import { summarizeEvent, toTimelineItem } from '../timeline.service';

describe('summarizeEvent', () => {
  it('builds a readable deployment summary from the payload', () => {
    expect(
      summarizeEvent('deployment.recorded', { service: 'checkout-api', environment: 'production' }),
    ).toBe('Deployment started: checkout-api → production');
  });

  it('describes status transitions with both endpoints', () => {
    expect(
      summarizeEvent('incident.status_changed', { fromStatus: 'open', status: 'mitigated' }),
    ).toBe('Status changed from open to mitigated');
  });

  it('distinguishes resolution notes from comments', () => {
    expect(summarizeEvent('incident.update_added', { kind: 'resolution_note' })).toBe(
      'Resolution note added',
    );
    expect(summarizeEvent('incident.update_added', { kind: 'comment' })).toBe('Comment added');
  });

  it('falls back to the raw type for unknown payloads', () => {
    expect(summarizeEvent('deployment.enriched', {})).toBe('Deployment updated: unknown status');
  });
});

describe('toTimelineItem', () => {
  it('carries the late flag and actor name through to the item', () => {
    const occurredAt = new Date('2026-02-01T10:00:00.000Z');
    const event: EventRow = {
      id: '11111111-1111-1111-1111-111111111111',
      sequence: 42,
      projectId: '22222222-2222-2222-2222-222222222222',
      type: 'deployment.recorded',
      entityType: 'deployment',
      entityId: '33333333-3333-3333-3333-333333333333',
      actorId: '44444444-4444-4444-4444-444444444444',
      payload: { service: 'api', environment: 'staging' },
      occurredAt,
      receivedAt: new Date('2026-02-01T10:20:00.000Z'),
      isLate: true,
      idempotencyKey: 'k',
      source: 'github',
      createdAt: occurredAt,
    };

    const item = toTimelineItem({ event, actorName: 'Ada' });
    expect(item.sequence).toBe('42');
    expect(item.isLate).toBe(true);
    expect(item.actorName).toBe('Ada');
    expect(item.summary).toBe('Deployment started: api → staging');
  });
});
