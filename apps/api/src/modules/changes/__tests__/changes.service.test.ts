import { describe, expect, it } from 'vitest';
import type { ChangeRow } from '../../../db/schema';
import { normalizeList, toChangeDto } from '../changes.service';

describe('normalizeList', () => {
  it('trims blanks and preserves first-seen casing', () => {
    expect(normalizeList([' src/checkout.ts ', ''])).toEqual(['src/checkout.ts']);
  });

  it('drops case-insensitive duplicates but keeps order', () => {
    expect(normalizeList(['A.ts', 'a.ts', 'B.ts', 'A.TS'])).toEqual(['A.ts', 'B.ts']);
  });

  it('returns an empty array for an empty input', () => {
    expect(normalizeList([])).toEqual([]);
  });
});

describe('toChangeDto', () => {
  it('serialises nullable fields and timestamps', () => {
    const now = new Date('2026-02-01T10:00:00.000Z');
    const row: ChangeRow = {
      id: '11111111-1111-1111-1111-111111111111',
      projectId: '22222222-2222-2222-2222-222222222222',
      deploymentId: null,
      type: 'commit',
      sha: 'abc1234',
      title: 'Fix checkout total',
      message: null,
      authorEmail: null,
      authorName: null,
      branch: null,
      url: null,
      filesChanged: ['src/checkout.ts'],
      services: ['checkout-api'],
      createdAt: now,
      updatedAt: now,
    };

    const dto = toChangeDto(row);
    expect(dto.deploymentId).toBeNull();
    expect(dto.message).toBeNull();
    expect(dto.createdAt).toBe('2026-02-01T10:00:00.000Z');
    expect(dto.filesChanged).toEqual(['src/checkout.ts']);
  });
});
