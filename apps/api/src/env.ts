import { z } from 'zod';

/**
 * Every environment variable is validated at boot. Production requires real
 * secrets; development/test fall back to deterministic local defaults so a fresh
 * clone can run `pnpm dev` and the test suite without any setup.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z
    .string()
    .min(1)
    .default('postgres://traceback:traceback@localhost:5432/traceback'),
  JWT_ACCESS_SECRET: z.string().min(16).optional(),
  JWT_REFRESH_SECRET: z.string().min(16).optional(),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60 * 24 * 30),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  LATE_EVENT_THRESHOLD_MS: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(5 * 60 * 1000),
  WEB_CONCURRENCY: z.coerce.number().int().positive().default(1),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(600),
  RATE_LIMIT_WINDOW: z.string().default('1 minute'),
});

export type RawEnv = z.infer<typeof envSchema>;

export interface AppEnv extends Omit<RawEnv, 'JWT_ACCESS_SECRET' | 'JWT_REFRESH_SECRET'> {
  JWT_ACCESS_SECRET: string;
  JWT_REFRESH_SECRET: string;
}

const DEV_ACCESS_SECRET = 'dev-only-access-secret-change-me';
const DEV_REFRESH_SECRET = 'dev-only-refresh-secret-change-me';

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  const env = parsed.data;
  const isProd = env.NODE_ENV === 'production';

  if (isProd) {
    const missing: string[] = [];
    if (!env.JWT_ACCESS_SECRET) missing.push('JWT_ACCESS_SECRET');
    if (!env.JWT_REFRESH_SECRET) missing.push('JWT_REFRESH_SECRET');
    if (!source.DATABASE_URL) missing.push('DATABASE_URL');
    if (missing.length > 0) {
      throw new Error(`Missing required production environment variables: ${missing.join(', ')}`);
    }
  }

  return {
    ...env,
    JWT_ACCESS_SECRET: env.JWT_ACCESS_SECRET ?? DEV_ACCESS_SECRET,
    JWT_REFRESH_SECRET: env.JWT_REFRESH_SECRET ?? DEV_REFRESH_SECRET,
  };
}
