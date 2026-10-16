/**
 * Serialise a timestamp read from a raw `db.execute` query into an ISO string.
 *
 * Drizzle's postgres-js driver swaps postgres-js's date parsers for an identity
 * function (see `postgres-js/driver.js`) so it can map columns itself. Raw
 * `db.execute` rows bypass that mapping, so their timestamps arrive as Postgres
 * text ("2026-10-16 09:48:26.164+00") even though the typed query builder hands
 * back `Date`s. Accepting both keeps the raw-row mappers correct either way.
 */
export function toIsoTimestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
