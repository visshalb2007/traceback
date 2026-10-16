/**
 * Parses an `If-Match` header into the optimistic-concurrency version it names.
 * Clients send the `rowVersion` they last read, either as a bare number (`3`) or as
 * a quoted ETag (`"3"`, `W/"3"`). Anything else is "no precondition".
 */
export function parseIfMatch(header: string | string[] | undefined): number | undefined {
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) return undefined;

  const match = /^(?:W\/)?"?(\d+)"?$/.exec(raw.trim());
  if (!match) return undefined;

  const value = Number.parseInt(match[1]!, 10);
  return Number.isInteger(value) && value >= 0 ? value : undefined;
}
