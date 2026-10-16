import fp from 'fastify-plugin';
import { createApiKeysService, type ApiKeysService } from '../modules/apikeys/apikeys.service';

declare module 'fastify' {
  interface FastifyInstance {
    apiKeys: ApiKeysService;
  }
}

/**
 * Exposes the API-key service as `app.apiKeys`. Registered before the auth plugin
 * so `requireAuth` can verify `tbk_...` bearer tokens against it.
 */
export const apiKeysPlugin = fp(
  async (app) => {
    app.decorate('apiKeys', createApiKeysService(app.db));
  },
  { name: 'traceback-apikeys', dependencies: ['traceback-db'] },
);
