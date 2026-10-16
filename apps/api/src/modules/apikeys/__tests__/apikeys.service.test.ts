import { describe, expect, it } from 'vitest';
import { apiKeyPrefix, capRole, generateApiKey, hashApiKey, hashMatches } from '../apikeys.service';

describe('generateApiKey', () => {
  it('produces a token whose prefix identifies it and whose hash matches', () => {
    const { token, prefix, tokenHash } = generateApiKey();
    expect(token.startsWith(`${prefix}_`)).toBe(true);
    expect(prefix).toMatch(/^tbk_[0-9a-f]{8}$/);
    expect(tokenHash).toBe(hashApiKey(token));
  });

  it('never repeats a token', () => {
    expect(generateApiKey().token).not.toBe(generateApiKey().token);
  });
});

describe('apiKeyPrefix', () => {
  it('extracts the public prefix', () => {
    expect(apiKeyPrefix('tbk_deadbeef_secretpart')).toBe('tbk_deadbeef');
  });

  it('returns null for tokens that are not api keys', () => {
    expect(apiKeyPrefix('eyJhbGciOi.jwt.token')).toBeNull();
    expect(apiKeyPrefix('tbk_')).toBeNull();
  });
});

describe('hashMatches', () => {
  it('accepts the matching token and rejects others', () => {
    const { token, tokenHash } = generateApiKey();
    expect(hashMatches(tokenHash, token)).toBe(true);
    expect(hashMatches(tokenHash, `${token}x`)).toBe(false);
    expect(hashMatches('deadbeef', token)).toBe(false);
  });
});

describe('capRole', () => {
  it('allows a role at or below the actor', () => {
    expect(capRole('viewer', 'admin')).toBe('viewer');
    expect(capRole('admin', 'admin')).toBe('admin');
  });

  it('caps a requested role above the actor', () => {
    expect(capRole('owner', 'viewer')).toBe('viewer');
    expect(capRole('admin', 'maintainer')).toBe('maintainer');
  });
});
