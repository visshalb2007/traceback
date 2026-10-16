import { createHash, randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { AppError } from './errors';

const ISSUER = 'traceback';
const AUDIENCE = 'traceback-api';

export type TokenType = 'access' | 'refresh';

export interface TokenPayload {
  sub: string;
  email: string;
  typ: TokenType;
  jti: string;
  [key: string]: unknown;
}

function key(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signToken(
  payload: Omit<TokenPayload, 'jti'> & { jti?: string },
  secret: string,
  ttlSeconds: number,
): Promise<string> {
  return new SignJWT({ ...payload, jti: payload.jti ?? randomUUID() })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(key(secret));
}

export async function verifyToken(token: string, secret: string): Promise<TokenPayload> {
  try {
    const { payload } = await jwtVerify(token, key(secret), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });

    if (typeof payload.sub !== 'string' || typeof payload.typ !== 'string') {
      throw new AppError('UNAUTHORIZED', 'Malformed token payload');
    }

    return payload as unknown as TokenPayload;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('UNAUTHORIZED', 'Invalid or expired token');
  }
}

/** Refresh tokens are persisted as a hash; the JWT itself is never stored. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function parseBearer(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const [scheme, value] = header.split(' ');
  if (!scheme || !value) return undefined;
  if (scheme.toLowerCase() !== 'bearer') return undefined;
  return value.trim() || undefined;
}
