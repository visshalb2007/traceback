import { createHmac, timingSafeEqual } from 'node:crypto';

/** The exact header value GitHub sends for an HMAC-SHA256 signature. */
export function computeGithubSignature(secret: string, rawBody: Buffer): string {
  return `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
}

/**
 * Constant-time HMAC comparison. A missing or malformed header is a rejection, not
 * an error — an unsigned delivery is simply not trusted. Pure so it is testable
 * without HTTP.
 */
export function verifyGithubSignature(
  secret: string,
  rawBody: Buffer,
  header: string | string[] | undefined | null,
): boolean {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) return false;

  const expected = Buffer.from(computeGithubSignature(secret, rawBody));
  const provided = Buffer.from(value);
  if (expected.length !== provided.length) return false;

  return timingSafeEqual(expected, provided);
}
