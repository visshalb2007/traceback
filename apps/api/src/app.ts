import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { FastifyBaseLogger } from 'fastify';
import './types';
import type { AppServer } from './types';
import { loadEnv, type AppEnv } from './env';
import { createLogger, newRequestId } from './logger';
import { toErrorResponse } from './lib/errors';
import { authPlugin } from './plugins/auth.plugin';
import { dbPlugin } from './plugins/db.plugin';
import { rbacPlugin } from './plugins/rbac.plugin';
import { registerRoutes } from './routes';

export interface BuildAppOptions {
  env?: AppEnv;
  logger?: FastifyBaseLogger;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<AppServer> {
  const env = options.env ?? loadEnv();
  const logger = options.logger ?? createLogger(env);

  const app = Fastify({
    loggerInstance: logger,
    genReqId: () => newRequestId(),
    requestIdHeader: 'x-request-id',
    trustProxy: true,
    bodyLimit: 2 * 1024 * 1024,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.decorate('config', env);

  await app.register(cors, {
    origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(',').map((o) => o.trim()),
    credentials: true,
    exposedHeaders: ['X-Idempotent-Replay', 'X-Request-Id', 'ETag'],
  });

  await app.register(helmet, { contentSecurityPolicy: false });

  await app.register(rateLimit, {
    max: env.NODE_ENV === 'test' ? 100_000 : env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
  });

  await app.register(dbPlugin, { env });

  await app.register(authPlugin);

  await app.register(rbacPlugin);

  app.setNotFoundHandler((request, reply) => {
    void reply.status(404).send({
      error: {
        code: 'NOT_FOUND',
        message: `Route ${request.method} ${request.url} not found`,
      },
    });
  });

  // Echo the request id back so clients and logs can be correlated.
  app.addHook('onSend', async (request, reply, payload) => {
    void reply.header('x-request-id', request.id);
    return payload;
  });

  app.setErrorHandler((error, request, reply) => {
    const { status, body } = toErrorResponse(error);
    if (status >= 500) {
      request.log.error({ err: error }, 'unhandled error');
    } else {
      request.log.debug({ err: error, code: body.error.code }, 'handled error');
    }
    void reply.status(status).send(body);
  });

  await registerRoutes(app);

  return app;
}
