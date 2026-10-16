import { z } from 'zod';
import {
  authTokensSchema,
  errorResponseSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  userSchema,
} from '@traceback/shared';
import type { AppServer } from '../../types';
import type { RequestContext } from './auth.service';

const commonErrors = {
  400: errorResponseSchema,
  401: errorResponseSchema,
  409: errorResponseSchema,
} as const;

function contextOf(request: { ip: string; headers: Record<string, unknown> }): RequestContext {
  const userAgent = request.headers['user-agent'];
  return {
    ip: request.ip,
    userAgent: typeof userAgent === 'string' ? userAgent : undefined,
  };
}

export async function authRoutes(app: AppServer): Promise<void> {
  app.post(
    '/auth/register',
    {
      schema: {
        body: registerSchema,
        response: { 201: authTokensSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      const tokens = await app.authService.register(request.body, contextOf(request));
      void reply.status(201).header('location', `/users/${tokens.user.id}`);
      return tokens;
    },
  );

  app.post(
    '/auth/login',
    { schema: { body: loginSchema, response: { 200: authTokensSchema, ...commonErrors } } },
    async (request) => app.authService.login(request.body, contextOf(request)),
  );

  app.post(
    '/auth/refresh',
    { schema: { body: refreshSchema, response: { 200: authTokensSchema, ...commonErrors } } },
    async (request) => app.authService.refresh(request.body.refreshToken, contextOf(request)),
  );

  app.post(
    '/auth/logout',
    {
      preHandler: app.requireAuth,
      schema: {
        body: refreshSchema.partial(),
        response: { 204: z.null(), ...commonErrors },
      },
    },
    async (request, reply) => {
      await app.authService.logout(request.body?.refreshToken, request.auth?.userId);
      return reply.status(204).send(null);
    },
  );

  app.get(
    '/auth/me',
    {
      preHandler: app.requireAuth,
      schema: { response: { 200: userSchema, ...commonErrors } },
    },
    async (request) => app.authService.me(request.auth!.userId),
  );
}
