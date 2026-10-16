import { createHash } from 'node:crypto';

/**
 * Recurring-issue detection needs a stable identity for a *problem*, not for one
 * report of it. Two incidents are "the same problem" when their normalised title,
 * service and error signature match — even if the timestamps, request ids or shas
 * embedded in the message differ.
 *
 * `normalizeForFingerprint` strips exactly the volatile parts (uuids, git shas,
 * bare numbers) and folds punctuation/case, so `"Timeout after 3000ms (req 9f2c)"`
 * and `"timeout after 4521ms (req a1b2)"` collapse to the same string.
 */
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
/** A request id carried in the signature, e.g. `(req 9f2c)` or `req: 9f2c1a3b`. */
const REQUEST_ID_PATTERN = /\breq\b[\s:#-]*[0-9a-z-]+/gi;
const SHA_PATTERN = /\b[0-9a-f]{7,40}\b/gi;
const NUMBER_PATTERN = /\d+/g;

export function normalizeForFingerprint(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(UUID_PATTERN, ' <id> ')
      // A request id changes on every report but never identifies the problem, so
      // drop the whole `req <id>` fragment before the generic masks below can turn
      // its digits/hex into id-specific noise.
      .replace(REQUEST_ID_PATTERN, ' ')
      .replace(SHA_PATTERN, ' <sha> ')
      .replace(NUMBER_PATTERN, ' <n> ')
      .replace(/[^a-z<>]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ')
  );
}

export interface FingerprintParts {
  title: string;
  service?: string | null | undefined;
  errorSignature?: string | null | undefined;
}

/** Deterministic, stable across processes: same input always yields same hash. */
export function computeFingerprint(parts: FingerprintParts): string {
  const material = [
    normalizeForFingerprint(parts.title),
    parts.service ? normalizeForFingerprint(parts.service) : '',
    parts.errorSignature ? normalizeForFingerprint(parts.errorSignature) : '',
  ].join('|');
  return createHash('sha256').update(material).digest('hex').slice(0, 32);
}
