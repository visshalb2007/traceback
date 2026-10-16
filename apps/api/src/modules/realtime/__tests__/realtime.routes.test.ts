import { describe, expect, it } from 'vitest';
import { resolveLastEventId } from '../realtime.routes';

describe('resolveLastEventId', () => {
  it('reads the Last-Event-ID header', () => {
    expect(resolveLastEventId('42', undefined)).toBe(42);
  });

  it('prefers the query parameter when both are present', () => {
    expect(resolveLastEventId('42', 7)).toBe(7);
  });

  it('takes the first value when the header is repeated', () => {
    expect(resolveLastEventId(['9', '10'], undefined)).toBe(9);
  });

  it('returns undefined when neither is provided', () => {
    expect(resolveLastEventId(undefined, undefined)).toBeUndefined();
  });

  it('treats a malformed header as no resume rather than zero', () => {
    expect(resolveLastEventId('', undefined)).toBeUndefined();
    expect(resolveLastEventId('abc', undefined)).toBeUndefined();
    expect(resolveLastEventId('-1', undefined)).toBeUndefined();
    expect(resolveLastEventId('1.5', undefined)).toBeUndefined();
  });

  it('accepts zero as a valid resume point', () => {
    expect(resolveLastEventId('0', undefined)).toBe(0);
  });
});
