import fp from 'fastify-plugin';
import { AppError } from '../lib/errors';
import { parseBearer } from '../lib/tokens';
import { createAuthService } from '../modules/auth/auth.service';

/**
 * Wires the auth service onto the instance and exposes `requireAuth` so routes
 * declare authentication in their options instead of repeating the parse logic.
 */
export const authPlugin = fp(
  async (app) => {
    app.decorate('authService', createAuthService(app.db, app.config));

    app.decorate('requireAuth', async (request) => {
      const token = parseBearer(request.headers.authorization);
      if (!token) {
        throw AppError.unauthorized('Missing bearer token');
      }

      const identity = await app.authService.verifyAccessToken(token);
      request.auth = { userId: identity.userId, email: identity.email };
    });
  },
  { name: 'traceback-auth', dependencies: ['traceback-db'] },
);
