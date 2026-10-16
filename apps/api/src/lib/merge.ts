/**
 * Value equality for merge decisions. Arrays and objects are compared structurally
 * (a new `affectedComponents` array with the same contents is *not* a change), while
 * primitives use `===`. `null` and `undefined` are deliberately distinct: clearing a
 * field is a real edit, omitting it is not.
 */
export function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (typeof a === 'object' || typeof b === 'object') {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

export interface MergeConflict {
  field: string;
  base: unknown;
  ours: unknown;
  theirs: unknown;
}

export interface MergeResult<T> {
  merged: Partial<T>;
  conflicts: MergeConflict[];
}

/**
 * Three-way merge of a caller's edits (`ours`) against a concurrent edit that
 * already landed (`theirs`), both derived from the shared `base` snapshot.
 *
 * - a field only `ours` touched is applied;
 * - a field only `theirs` touched is left alone (it keeps the server value);
 * - a field both touched with the *same* value is applied once;
 * - a field both touched *differently* is a conflict — reported to the caller and
 *   resolved in favour of `ours` so no work is silently discarded.
 *
 * This is what lets two responders edit different parts of an incident at the same
 * time without one of them losing their changes.
 */
export function threeWayMerge<T extends Record<string, unknown>>(
  base: Partial<T>,
  ours: Partial<T>,
  theirs: Partial<T>,
): MergeResult<T> {
  const merged: Partial<T> = {};
  const conflicts: MergeConflict[] = [];
  const keys = new Set<string>([...Object.keys(ours), ...Object.keys(theirs)]);

  for (const key of keys) {
    // A field the caller did not send is not the caller's business; the server
    // value already holds whatever the other writer decided.
    if (!Object.prototype.hasOwnProperty.call(ours, key)) continue;

    const key0 = key as keyof T & string;
    const oursValue = ours[key0];
    const theirsValue = theirs[key0];
    const baseValue = base[key0];

    const oursChanged = !isEqual(oursValue, baseValue);
    if (!oursChanged) continue;

    const theirsChanged = !isEqual(theirsValue, baseValue);
    if (!theirsChanged || isEqual(oursValue, theirsValue)) {
      merged[key0] = oursValue;
      continue;
    }

    conflicts.push({
      field: key,
      base: baseValue,
      ours: oursValue,
      theirs: theirsValue,
    });
    merged[key0] = oursValue;
  }

  return { merged, conflicts };
}

export interface FieldDiff {
  field: string;
  current: unknown;
  incoming: unknown;
}

/**
 * Field-level diff between the stored entity and an incoming patch. Used to make a
 * `409` explain *which* fields moved, instead of just saying "someone else changed
 * this" (see the conflict-handling section of the README).
 */
export function diffFields<T extends Record<string, unknown>>(
  current: Partial<T>,
  incoming: Partial<T>,
): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  for (const key of Object.keys(incoming)) {
    const key0 = key as keyof T & string;
    if (isEqual(current[key0], incoming[key0])) continue;
    diffs.push({ field: key, current: current[key0], incoming: incoming[key0] });
  }
  return diffs;
}
