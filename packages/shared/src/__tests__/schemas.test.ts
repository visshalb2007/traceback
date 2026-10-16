import { describe, expect, it } from 'vitest';
import {
  canTransitionStatus,
  createIncidentSchema,
  errorResponseSchema,
  paginationQuerySchema,
  recordDeploymentSchema,
} from '../index';

describe('enums / state machine', () => {
  it('allows the documented forward transitions', () => {
    expect(canTransitionStatus('open', 'investigating')).toBe(true);
    expect(canTransitionStatus('investigating', 'mitigated')).toBe(true);
    expect(canTransitionStatus('mitigated', 'resolved')).toBe(true);
    expect(canTransitionStatus('resolved', 'closed')).toBe(true);
  });

  it('allows reopening from resolved/closed', () => {
    expect(canTransitionStatus('resolved', 'open')).toBe(true);
    expect(canTransitionStatus('closed', 'open')).toBe(true);
  });

  it('allows the documented fast-path straight to closed from open', () => {
    expect(canTransitionStatus('open', 'closed')).toBe(true);
  });

  it('rejects invalid transitions and no-op transitions', () => {
    expect(canTransitionStatus('mitigated', 'closed')).toBe(false);
    expect(canTransitionStatus('open', 'open')).toBe(false);
  });
});

describe('deployment schema', () => {
  it('accepts a minimal, incomplete deployment record', () => {
    const parsed = recordDeploymentSchema.parse({ service: 'api', environment: 'production' });
    expect(parsed.status).toBe('unknown');
    expect(parsed.commitSha).toBeUndefined();
  });

  it('rejects a non-hex commit sha', () => {
    const result = recordDeploymentSchema.safeParse({
      service: 'api',
      environment: 'production',
      commitSha: 'not-a-sha',
    });
    expect(result.success).toBe(false);
  });
});

describe('incident schema', () => {
  it('defaults severity and status', () => {
    const parsed = createIncidentSchema.parse({
      title: 'Checkout 500s',
      startedAt: new Date().toISOString(),
    });
    expect(parsed.severity).toBe('sev3');
    expect(parsed.status).toBe('open');
    expect(parsed.affectedComponents).toEqual([]);
  });
});

describe('common schemas', () => {
  it('coerces pagination limit and applies a default', () => {
    expect(paginationQuerySchema.parse({}).limit).toBe(50);
    expect(paginationQuerySchema.parse({ limit: '10' }).limit).toBe(10);
  });

  it('matches the canonical error envelope', () => {
    const parsed = errorResponseSchema.parse({
      error: { code: 'NOT_FOUND', message: 'nope' },
    });
    expect(parsed.error.code).toBe('NOT_FOUND');
  });
});
