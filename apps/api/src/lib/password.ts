import argon2 from 'argon2';

/**
 * OWASP-recommended argon2id parameters (19 MiB, t=2, p=1). Kept in one place so
 * the cost can be tuned for the deployment target without hunting for call sites.
 */
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON2_OPTIONS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    // Malformed hash: treat as a failed verification rather than a 500.
    return false;
  }
}
