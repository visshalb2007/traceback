import { describe, expect, it } from 'vitest';
import type { IncidentRow, IncidentUpdateRow } from '../../../db/schema';
import {
  incidentPatch,
  snapshotIncident,
  toFingerprintGroupDto,
  toIncidentUpdateDto,
} from '../incidents.service';

function incidentRow(overrides: Partial<IncidentRow> = {}): IncidentRow {
  const now = new Date('2026-02-01T10:00:00.000Z');
  return {
    id: '11111111-1111-1111-1111-111111111111',
    projectId: '22222222-2222-2222-2222-222222222222',
    title: 'Checkout failing',
    description: 'lots of 500s',
    severity: 'sev2',
    status: 'open',
    service: 'checkout-api',
    errorSignature: null,
    affectedComponents: ['checkout-api'],
    environment: 'production',
    fingerprint: 'abc',
    startedAt: now,
    detectedAt: null,
    resolvedAt: null,
    resolvedBy: null,
    resolution: null,
    rowVersion: 3,
    createdBy: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('snapshotIncident', () => {
  it('captures the mergeable fields plus the row version', () => {
    const snapshot = snapshotIncident(incidentRow());
    expect(snapshot).toMatchObject({ title: 'Checkout failing', severity: 'sev2', rowVersion: 3 });
    // Identity/system fields are deliberately excluded from the merge base.
    expect(snapshot).not.toHaveProperty('id');
    expect(snapshot).not.toHaveProperty('projectId');
  });
});

describe('incidentPatch', () => {
  it('keeps only the fields the caller actually sent', () => {
    expect(incidentPatch({ title: 'New title' })).toEqual({ title: 'New title' });
  });

  it('honours explicit nulls but ignores absent fields', () => {
    expect(incidentPatch({ description: null })).toEqual({ description: null });
    expect(incidentPatch({})).toEqual({});
  });
});

describe('toIncidentUpdateDto', () => {
  it('maps a row and its author name to the API shape', () => {
    const now = new Date('2026-02-01T10:00:00.000Z');
    const row: IncidentUpdateRow = {
      id: '33333333-3333-3333-3333-333333333333',
      incidentId: '11111111-1111-1111-1111-111111111111',
      authorId: '44444444-4444-4444-4444-444444444444',
      kind: 'comment',
      body: 'Investigating',
      occurredAt: now,
      createdAt: now,
    };

    expect(toIncidentUpdateDto(row, 'Ada')).toEqual({
      id: row.id,
      incidentId: row.incidentId,
      authorId: row.authorId,
      authorName: 'Ada',
      kind: 'comment',
      body: 'Investigating',
      occurredAt: '2026-02-01T10:00:00.000Z',
      createdAt: '2026-02-01T10:00:00.000Z',
    });
  });
});

describe('toFingerprintGroupDto', () => {
  it('maps the recurrence aggregation into the wire shape', () => {
    const dto = toFingerprintGroupDto({
      fingerprint: 'fp-1',
      title: 'Checkout 500s',
      service: 'checkout-api',
      severity: 'sev1',
      count: 4,
      active_count: 2,
      first_seen_at: new Date('2026-01-01T00:00:00.000Z'),
      last_seen_at: new Date('2026-02-01T10:00:00.000Z'),
      incident_ids: ['a', 'b'],
    });

    expect(dto).toEqual({
      fingerprint: 'fp-1',
      title: 'Checkout 500s',
      service: 'checkout-api',
      severity: 'sev1',
      count: 4,
      activeCount: 2,
      firstSeenAt: '2026-01-01T00:00:00.000Z',
      lastSeenAt: '2026-02-01T10:00:00.000Z',
      incidentIds: ['a', 'b'],
    });
  });
});
