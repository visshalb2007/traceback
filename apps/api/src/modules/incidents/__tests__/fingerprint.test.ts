import { describe, expect, it } from 'vitest';
import { computeFingerprint, normalizeForFingerprint } from '../fingerprint';

describe('normalizeForFingerprint', () => {
  it('folds case and collapses punctuation to single spaces', () => {
    expect(normalizeForFingerprint('Checkout   API: TIMEOUT!')).toBe('checkout api timeout');
  });

  it('replaces volatile identifiers so repeated problems collapse', () => {
    const a = normalizeForFingerprint('Timeout after 3000ms (req 9f2c1a3b)');
    const b = normalizeForFingerprint('timeout after 4521ms (req a1b2c3d4)');
    expect(a).toBe(b);
  });

  it('strips request ids however short or mixed-case they are', () => {
    const a = normalizeForFingerprint('Timeout after 3000ms (req 9f2c)');
    const b = normalizeForFingerprint('timeout after 4521ms (REQ ab12)');
    expect(a).toBe(b);
    expect(a).not.toContain('req');
  });

  it('masks uuids and git shas', () => {
    const normalized = normalizeForFingerprint(
      'failed on 11111111-2222-3333-4444-555555555555 at deadbeef1234',
    );
    expect(normalized).toContain('<id>');
    expect(normalized).toContain('<sha>');
  });
});

describe('computeFingerprint', () => {
  it('is deterministic for the same problem', () => {
    const a = computeFingerprint({ title: 'DB down', service: 'api' });
    const b = computeFingerprint({ title: 'db DOWN', service: 'API' });
    expect(a).toBe(b);
  });

  it('separates problems by service and by error signature', () => {
    const base = computeFingerprint({ title: 'DB down', service: 'api' });
    expect(computeFingerprint({ title: 'DB down', service: 'worker' })).not.toBe(base);
    expect(computeFingerprint({ title: 'DB down', service: 'api', errorSignature: 'x' })).not.toBe(
      base,
    );
  });

  it('produces a stable 32-char hex digest', () => {
    expect(computeFingerprint({ title: 'anything' })).toMatch(/^[0-9a-f]{32}$/);
  });

  it('ignores a request id that differs only in the signature', () => {
    const a = computeFingerprint({
      title: 'Checkout latency spike',
      service: 'checkout',
      errorSignature: 'timeout after 3000ms (req 9f2c)',
    });
    const b = computeFingerprint({
      title: 'Checkout latency spike',
      service: 'checkout',
      errorSignature: 'timeout after 1000ms (req ab12)',
    });
    expect(a).toBe(b);
  });
});
