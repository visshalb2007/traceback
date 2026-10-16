import { describe, expect, it } from 'vitest';
import type { DeploymentStatus, IncidentSeverity } from '@traceback/shared';
import {
  changeFailureRate,
  countIncidents,
  resolveWindow,
  summariseDeployments,
  summariseMttr,
  toRecurringIssue,
  toSuspectDeployment,
  zeroCounts,
} from '../dashboard.service';

describe('zeroCounts', () => {
  it('returns every key mapped to zero', () => {
    expect(zeroCounts(['a', 'b'])).toEqual({ a: 0, b: 0 });
  });
});

describe('resolveWindow', () => {
  it('defaults to the trailing window ending now', () => {
    const now = new Date('2026-03-31T00:00:00.000Z');
    const window = resolveWindow({ windowDays: 30 }, now);
    expect(window.to).toEqual(now);
    expect(window.from.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(window.days).toBe(30);
  });

  it('honours explicit bounds and derives the day span', () => {
    const window = resolveWindow({
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-01-08T00:00:00.000Z',
      windowDays: 365,
    });
    expect(window.days).toBe(7);
  });

  it('never returns a window that runs backwards', () => {
    const window = resolveWindow({
      from: '2026-02-01T00:00:00.000Z',
      to: '2026-01-01T00:00:00.000Z',
      windowDays: 30,
    });
    expect(window.from.getTime()).toBeLessThanOrEqual(window.to.getTime());
    expect(window.days).toBe(1);
  });
});

describe('countIncidents', () => {
  it('fills every severity and status, including the ones with no rows', () => {
    const counts = countIncidents([
      { severity: 'sev1', status: 'open', count: 2 },
      { severity: 'sev1', status: 'resolved', count: 1 },
      { severity: 'sev3', status: 'open', count: 4 },
    ]);

    expect(counts.total).toBe(7);
    expect(counts.bySeverity).toEqual({ sev1: 3, sev2: 0, sev3: 4, sev4: 0 });
    expect(counts.byStatus.open).toBe(6);
    expect(counts.byStatus.resolved).toBe(1);
    expect(counts.byStatus.closed).toBe(0);
  });
});

describe('summariseMttr', () => {
  it('averages per severity and overall, reporting null for unseen severities', () => {
    const mttr = summariseMttr([
      { severity: 'sev1', seconds: 600 },
      { severity: 'sev1', seconds: 1200 },
      { severity: 'sev2', seconds: 300 },
    ]);

    expect(mttr.overallSeconds).toBe(700);
    expect(mttr.bySeverity.sev1).toBe(900);
    expect(mttr.bySeverity.sev2).toBe(300);
    expect(mttr.bySeverity.sev3).toBeNull();
    expect(mttr.resolvedCount).toBe(3);
  });

  it('reports an empty footprint when nothing was resolved', () => {
    const mttr = summariseMttr([]);
    expect(mttr.overallSeconds).toBeNull();
    expect(mttr.resolvedCount).toBe(0);
    expect(mttr.bySeverity.sev1).toBeNull();
  });
});

describe('summariseDeployments', () => {
  const rows = [
    {
      environment: 'production',
      status: 'success' as DeploymentStatus,
      day: '2026-01-01',
      count: 2,
    },
    {
      environment: 'production',
      status: 'failed' as DeploymentStatus,
      day: '2026-01-01',
      count: 1,
    },
    { environment: 'staging', status: 'success' as DeploymentStatus, day: '2026-01-03', count: 3 },
  ];

  it('totals by status/environment and zero-fills the daily series', () => {
    const summary = summariseDeployments(rows, {
      from: new Date('2026-01-01T00:00:00.000Z'),
      days: 3,
    });

    expect(summary.totalDeployments).toBe(6);
    expect(summary.byStatus.success).toBe(5);
    expect(summary.byStatus.failed).toBe(1);
    expect(summary.byEnvironment).toEqual({ production: 3, staging: 3 });
    expect(summary.daily).toEqual([
      { date: '2026-01-01', count: 3 },
      { date: '2026-01-02', count: 0 },
      { date: '2026-01-03', count: 3 },
    ]);
    expect(summary.perDay).toBe(2);
  });

  it('reports a flat zero series for a quiet window', () => {
    const summary = summariseDeployments([], {
      from: new Date('2026-01-01T00:00:00.000Z'),
      days: 2,
    });
    expect(summary.totalDeployments).toBe(0);
    expect(summary.perDay).toBe(0);
    expect(summary.daily.map((day) => day.count)).toEqual([0, 0]);
  });
});

describe('changeFailureRate', () => {
  it('counts failed and rolled-back deployments as failures', () => {
    const byStatus = zeroCounts<DeploymentStatus>([
      'queued',
      'in_progress',
      'success',
      'failed',
      'rolled_back',
      'cancelled',
      'unknown',
    ]);
    byStatus.success = 6;
    byStatus.failed = 2;
    byStatus.rolled_back = 2;

    expect(changeFailureRate(byStatus)).toEqual({
      rate: 0.4,
      failedDeployments: 4,
      totalDeployments: 10,
    });
  });

  it('avoids dividing by zero', () => {
    const byStatus = zeroCounts<DeploymentStatus>([
      'queued',
      'in_progress',
      'success',
      'failed',
      'rolled_back',
      'cancelled',
      'unknown',
    ]);
    expect(changeFailureRate(byStatus).rate).toBe(0);
  });
});

describe('toRecurringIssue', () => {
  it('maps the aggregation row and ISO-serialises timestamps', () => {
    expect(
      toRecurringIssue({
        fingerprint: 'fp-1',
        title: 'Checkout 500s',
        service: 'checkout-api',
        occurrences: 3,
        avg_mttr_seconds: 900,
        first_seen_at: new Date('2026-01-01T00:00:00.000Z'),
        last_seen_at: new Date('2026-02-01T00:00:00.000Z'),
        incident_ids: ['a', 'b', 'c'],
      }),
    ).toEqual({
      fingerprint: 'fp-1',
      title: 'Checkout 500s',
      service: 'checkout-api',
      occurrences: 3,
      avgMttrSeconds: 900,
      firstSeenAt: '2026-01-01T00:00:00.000Z',
      lastSeenAt: '2026-02-01T00:00:00.000Z',
      incidentIds: ['a', 'b', 'c'],
    });
  });
});

describe('toSuspectDeployment', () => {
  it('rounds the score and defaults missing reasons to an empty list', () => {
    const dto = toSuspectDeployment({
      deployment_id: 'd-1',
      service: 'checkout-api',
      environment: 'production',
      status: 'failed' as DeploymentStatus,
      version: 'v1.2.3',
      occurred_at: new Date('2026-01-01T00:00:00.000Z'),
      linked_incident_count: 2,
      score: 0.833333,
      reasons: null,
    });

    expect(dto.score).toBe(0.8333);
    expect(dto.reasons).toEqual([]);
    expect(dto.occurredAt).toBe('2026-01-01T00:00:00.000Z');
  });
});

describe('severity typing', () => {
  it('keeps the severity union narrow enough for exhaustive records', () => {
    const severities: readonly IncidentSeverity[] = ['sev1', 'sev2', 'sev3', 'sev4'];
    expect(Object.keys(zeroCounts(severities)).sort()).toEqual(['sev1', 'sev2', 'sev3', 'sev4']);
  });
});
