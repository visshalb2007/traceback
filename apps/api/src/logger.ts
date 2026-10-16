import { randomUUID } from 'node:crypto';
import type { FastifyBaseLogger } from 'fastify';
import { pino, type LoggerOptions } from 'pino';
import type { AppEnv } from './env';

/**
 * Structured logging with a request id on every line. Pretty output in dev,
 * newline-delimited JSON everywhere else (what a log aggregator wants).
 *
 * Returns `FastifyBaseLogger` so it can be handed straight to Fastify without
 * widening the instance's logger type parameter.
 */
export function createLogger(env: AppEnv): FastifyBaseLogger {
  const options: LoggerOptions = {
    level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
    base: { service: 'traceback-api' },
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        '*.password',
        '*.refreshToken',
        '*.secret',
      ],
      remove: true,
    },
  };

  if (env.NODE_ENV === 'development') {
    options.transport = {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname' },
    };
  }

  return pino(options);
}

export const newRequestId = (): string => randomUUID();
