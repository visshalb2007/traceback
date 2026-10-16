import { describe, expect, it } from 'vitest';
import { computeGithubSignature, verifyGithubSignature } from '../webhooks.signature';

const secret = 'super-secret-signing-key';
const body = Buffer.from(JSON.stringify({ hello: 'world' }));

describe('computeGithubSignature', () => {
  it('prefixes the digest with sha256=', () => {
    expect(computeGithubSignature(secret, body)).toMatch(/^sha256=[0-9a-f]{64}$/);
  });

  it('is deterministic for the same secret and body', () => {
    expect(computeGithubSignature(secret, body)).toBe(computeGithubSignature(secret, body));
  });
});

describe('verifyGithubSignature', () => {
  it('accepts the matching signature', () => {
    const header = computeGithubSignature(secret, body);
    expect(verifyGithubSignature(secret, body, header)).toBe(true);
  });

  it('rejects a signature from the wrong secret', () => {
    const header = computeGithubSignature('other-secret-value', body);
    expect(verifyGithubSignature(secret, body, header)).toBe(false);
  });

  it('rejects a signature over a different body', () => {
    const header = computeGithubSignature(secret, Buffer.from('tampered'));
    expect(verifyGithubSignature(secret, body, header)).toBe(false);
  });

  it('rejects a missing or empty header', () => {
    expect(verifyGithubSignature(secret, body, undefined)).toBe(false);
    expect(verifyGithubSignature(secret, body, null)).toBe(false);
    expect(verifyGithubSignature(secret, body, '')).toBe(false);
  });

  it('uses the first value when the header is repeated', () => {
    const header = computeGithubSignature(secret, body);
    expect(verifyGithubSignature(secret, body, [header, 'garbage'])).toBe(true);
  });
});
