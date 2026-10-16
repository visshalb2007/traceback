import fp from 'fastify-plugin';
import { AppError } from '../lib/errors';
import { parseBearer } from '../lib/tokens';
import { apiKeyPrefix } from '../modules/apikeys/apikeys.service';
import { createAuthService } from '../modules/auth/auth.service';

/**
 * Wires the auth service onto the instance and exposes `requireAuth` so routes
 * declare authentication in their options instead of repeating the parse logic.
 *
 * A bearer token is either a JWT access token or a project-scoped API key
 * (`tbk_...`). Both resolve to a `request.auth`; an API key additionally sets
 * `request.apiKey` so the RBAC guard can use its fixed role.
 */
export const authPlugin = fp(
  async (app) => {
    app.decorate('authService', createAuthService(app.db, app.config));

    app.decorate('requireAuth', async (request) => {
      const token = parseBearer(request.headers.authorization);
      if (!token) {
        throw AppError.unauthorized('Missing bearer token');
      }

      if (apiKeyPrefix(token) !== null) {
        const identity = await app.apiKeys.authenticate(token);
        if (!identity) {
          throw AppError.unauthorized('Invalid API key');
        }
        request.auth = {
          userId: identity.userId,
          email: identity.email ?? '',
          apiKeyId: identity.apiKeyId,
        };
        request.apiKey = {
          id: identity.apiKeyId,
          projectId: identity.projectId,
          role: identity.role,
        };
        return;
      }

      const identity = await app.authService.verifyAccessToken(token);
      request.auth = { userId: identity.userId, email: identity.email };
    });
  },
  { name: 'traceback-auth', dependencies: ['traceback-db', 'traceback-apikeys'] },
);
