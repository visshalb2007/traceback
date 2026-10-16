import type {
  FastifyBaseLogger,
  FastifyInstance,
  FastifyRequest,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault,
} from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

/**
 * The one Fastify instance type this codebase uses: Zod as the schema/validator
 * provider so every route is typed end-to-end from a Zod schema.
 */
export type AppServer = FastifyInstance<
  RawServerDefault,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  FastifyBaseLogger,
  ZodTypeProvider
>;

/** A route module: a plain async function registered with `app.register`. */
export type RoutePlugin = (app: AppServer) => Promise<void>;

/** Request after the auth plugin has run (always populated for protected routes). */
export interface AuthedRequest extends FastifyRequest {
  auth: AuthContext;
}

export interface AuthContext {
  userId: string;
  email: string;
  /** Present when the caller authenticated with a project-scoped API key. */
  apiKeyId?: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Attached by the auth plugin when a valid bearer token/key is present. */
    auth?: AuthContext;
  }
}
