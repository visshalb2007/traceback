import { describe, expect, it } from 'vitest';
import { toIsoTimestamp } from '../time';

describe('toIsoTimestamp', () => {
  it('serialises a Date', () => {
    expect(toIsoTimestamp(new Date('2026-01-02T03:04:05.678Z'))).toBe('2026-01-02T03:04:05.678Z');
  });

  it('parses the Postgres text format a raw `db.execute` row carries', () => {
    expect(toIsoTimestamp('2026-01-02 03:04:05.678+00')).toBe('2026-01-02T03:04:05.678Z');
  });
});
