import { describe, expect, it } from 'vitest';
import { buildAuditDiff, toAuditLogDto } from '../audit.service';
import type { AuditLogRow } from '../../../db/schema';

describe('buildAuditDiff', () => {
  it('records only the fields that changed', () => {
    const diff = buildAuditDiff(
      { title: 'Old', severity: 'sev3' },
      { title: 'New', severity: 'sev3' },
    );
    expect(diff).toEqual({ title: { before: 'Old', after: 'New' } });
  });

  it('treats an added field as a change from null', () => {
    expect(buildAuditDiff({ title: 'x' }, { title: 'x', service: 'api' })).toEqual({
      service: { before: null, after: 'api' },
    });
  });

  it('is empty when nothing changed', () => {
    expect(buildAuditDiff({ a: 1 }, { a: 1 })).toEqual({});
  });
});

describe('toAuditLogDto', () => {
  it('serialises timestamps and keeps before/after/diff', () => {
    const now = new Date('2026-02-01T10:00:00.000Z');
    const row: AuditLogRow = {
      id: '11111111-1111-1111-1111-111111111111',
      projectId: '22222222-2222-2222-2222-222222222222',
      actorId: null,
      actorEmail: 'ada@example.com',
      action: 'update',
      entityType: 'incident',
      entityId: '33333333-3333-3333-3333-333333333333',
      before: { status: 'open' },
      after: { status: 'investigating' },
      diff: { status: { before: 'open', after: 'investigating' } },
      ip: '127.0.0.1',
      userAgent: 'vitest',
      createdAt: now,
    };

    const dto = toAuditLogDto(row);
    expect(dto.createdAt).toBe('2026-02-01T10:00:00.000Z');
    expect(dto.diff).toEqual({ status: { before: 'open', after: 'investigating' } });
    expect(dto.actorEmail).toBe('ada@example.com');
  });
});
