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
const SHA_PATTERN = /\b[0-9a-f]{7,40}\b/gi;
const NUMBER_PATTERN = /\d+/g;

export function normalizeForFingerprint(text: string): string {
  return text
    .toLowerCase()
    .replace(UUID_PATTERN, ' <id> ')
    .replace(SHA_PATTERN, ' <sha> ')
    .replace(NUMBER_PATTERN, ' <n> ')
    .replace(/[^a-z<>]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
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
