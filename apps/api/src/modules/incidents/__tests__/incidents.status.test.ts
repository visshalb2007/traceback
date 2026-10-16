import { describe, expect, it } from 'vitest';
import type { IncidentRow } from '../../../db/schema';
import { AppError } from '../../../lib/errors';
import { describeStatusChange, planStatusChange } from '../incidents.status';

function row(overrides: Partial<IncidentRow> = {}): IncidentRow {
  const now = new Date('2026-02-01T10:00:00.000Z');
  return {
    id: '11111111-1111-1111-1111-111111111111',
    projectId: '22222222-2222-2222-2222-222222222222',
    title: 'Checkout failing',
    description: null,
    severity: 'sev2',
    status: 'open',
    service: 'checkout-api',
    errorSignature: null,
    affectedComponents: [],
    environment: null,
    fingerprint: 'abc',
    startedAt: now,
    detectedAt: null,
    resolvedAt: null,
    resolvedBy: null,
    resolution: null,
    rowVersion: 1,
    createdBy: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const now = new Date('2026-02-02T12:00:00.000Z');

describe('planStatusChange', () => {
  it('allows a legal forward transition and labels it status_changed', () => {
    const plan = planStatusChange(
      row({ status: 'open' }),
      'investigating',
      'actor',
      undefined,
      now,
    );
    expect(plan.patch).toEqual({ status: 'investigating' });
    expect(plan.eventType).toBe('incident.status_changed');
  });

  it('stamps resolution bookkeeping when resolving', () => {
    const plan = planStatusChange(
      row({ status: 'investigating' }),
      'resolved',
      'actor-1',
      'fixed it',
      now,
    );
    expect(plan.patch.status).toBe('resolved');
    expect(plan.patch.resolvedAt).toEqual(now);
    expect(plan.patch.resolvedBy).toBe('actor-1');
    expect(plan.patch.resolution).toBe('fixed it');
    expect(plan.eventType).toBe('incident.resolved');
  });

  it('clears resolution bookkeeping when reopening', () => {
    const plan = planStatusChange(
      row({ status: 'resolved', resolvedAt: now, resolvedBy: 'actor-1', resolution: 'done' }),
      'open',
      'actor-2',
      undefined,
      now,
    );
    expect(plan.patch.resolvedAt).toBeNull();
    expect(plan.patch.resolvedBy).toBeNull();
    expect(plan.patch.resolution).toBeNull();
    expect(plan.eventType).toBe('incident.reopened');
  });

  it('refuses an illegal transition with a 422-shaped error', () => {
    try {
      planStatusChange(row({ status: 'closed' }), 'mitigated', null, undefined, now);
      throw new Error('expected planStatusChange to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe('INVALID_TRANSITION');
      expect((error as AppError).status).toBe(422);
    }
  });

  it('rejects a no-op transition', () => {
    expect(() => planStatusChange(row({ status: 'open' }), 'open', null, undefined, now)).toThrow();
  });
});

describe('describeStatusChange', () => {
  it('builds a timeline summary', () => {
    expect(describeStatusChange('open', 'mitigated')).toBe('Status changed from open to mitigated');
  });
});
