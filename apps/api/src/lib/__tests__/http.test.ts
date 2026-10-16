import { describe, expect, it } from 'vitest';
import { parseIfMatch } from '../http';

describe('parseIfMatch', () => {
  it('accepts bare, quoted and weak ETag forms', () => {
    expect(parseIfMatch('3')).toBe(3);
    expect(parseIfMatch('"3"')).toBe(3);
    expect(parseIfMatch('W/"12"')).toBe(12);
  });

  it('returns undefined for missing or malformed values', () => {
    expect(parseIfMatch(undefined)).toBeUndefined();
    expect(parseIfMatch('')).toBeUndefined();
    expect(parseIfMatch('*')).toBeUndefined();
    expect(parseIfMatch('abc')).toBeUndefined();
  });

  it('uses the first value when the header repeats', () => {
    expect(parseIfMatch(['5', '6'])).toBe(5);
  });
});
