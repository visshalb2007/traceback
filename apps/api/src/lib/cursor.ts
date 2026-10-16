/**
 * Opaque keyset cursors. Values are joined with a `|` separator (ISO timestamps
 * and UUIDs never contain one) and base64url-encoded so clients treat them as
 * black boxes and cannot depend on the internal shape.
 */
export function encodeCursor(parts: Array<string | number>): string {
  return Buffer.from(parts.map(String).join('|'), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): string[] {
  const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  const parts = decoded.split('|');
  if (parts.length === 0 || parts.some((part) => part.length === 0)) {
    return [];
  }
  return parts;
}
