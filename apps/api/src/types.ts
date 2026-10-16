import type {
  FastifyBaseLogger,
  FastifyInstance,
  FastifyRequest,
  preHandlerAsyncHookHandler,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault,
} from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { ProjectRole } from '@traceback/shared';
import type { AppEnv } from './env';
import type { ProjectRow } from './db/schema';
import type { Action } from './lib/policy';
import type { AuthService } from './modules/auth/auth.service';
import type { MembersRepository } from './modules/members/members.repository';

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
  interface FastifyInstance {
    /** Validated environment, decorated once at boot. */
    config: AppEnv;
    authService: AuthService;
    /** preHandler that populates `request.auth` or throws 401. */
    requireAuth: preHandlerAsyncHookHandler;
    membersRepository: MembersRepository;
    /** preHandler factory that resolves the caller's project role and enforces the policy matrix. */
    authorize: (action: Action) => preHandlerAsyncHookHandler;
  }

  interface FastifyRequest {
    /** Attached by the auth plugin when a valid bearer token/key is present. */
    auth?: AuthContext;
    /** Populated by `authorize()` once the caller's role has been resolved. */
    projectRole?: ProjectRole;
    /** Populated by `authorize()` with the (non-deleted) project row. */
    project?: ProjectRow;
  }
}
