import { describe, expect, it } from 'vitest';
import { diffFields, isEqual, threeWayMerge } from '../merge';

describe('isEqual', () => {
  it('compares arrays structurally', () => {
    expect(isEqual(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(isEqual(['a', 'b'], ['a', 'c'])).toBe(false);
  });

  it('treats null and undefined as different', () => {
    expect(isEqual(null, undefined)).toBe(false);
    expect(isEqual(null, null)).toBe(true);
  });
});

describe('threeWayMerge', () => {
  type Row = { title: string; description: string; severity: string };
  const base: Row = { title: 'Old', description: 'hello', severity: 'sev3' };

  it('applies edits only the caller made', () => {
    const { merged, conflicts } = threeWayMerge(base, { title: 'New' }, { ...base });
    expect(merged).toEqual({ title: 'New' });
    expect(conflicts).toEqual([]);
  });

  it('leaves fields only the other writer touched alone', () => {
    const { merged } = threeWayMerge<Row>(
      base,
      { title: 'New' },
      { ...base, description: 'theirs' },
    );
    expect(merged).toEqual({ title: 'New' });
  });

  it('merges non-overlapping edits with no conflict', () => {
    const { merged, conflicts } = threeWayMerge<Row>(
      base,
      { title: 'New' },
      { ...base, description: 'theirs' },
    );
    expect(conflicts).toEqual([]);
    expect(merged.title).toBe('New');
  });

  it('reports a field both sides changed differently, favouring ours', () => {
    const { merged, conflicts } = threeWayMerge(
      base,
      { severity: 'sev1' },
      { ...base, severity: 'sev4' },
    );
    expect(conflicts).toEqual([{ field: 'severity', base: 'sev3', ours: 'sev1', theirs: 'sev4' }]);
    expect(merged.severity).toBe('sev1');
  });

  it('treats an identical concurrent edit as no conflict', () => {
    const { merged, conflicts } = threeWayMerge(
      base,
      { title: 'Same' },
      { ...base, title: 'Same' },
    );
    expect(conflicts).toEqual([]);
    expect(merged.title).toBe('Same');
  });
});

describe('diffFields', () => {
  it('lists only the fields that actually changed', () => {
    const diff = diffFields({ title: 'a', severity: 'sev3' }, { title: 'b', severity: 'sev3' });
    expect(diff).toEqual([{ field: 'title', current: 'a', incoming: 'b' }]);
  });
});
