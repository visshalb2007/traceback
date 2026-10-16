import fp from 'fastify-plugin';
import { createRealtimeBroker } from '../modules/realtime/realtime.broker';

/**
 * Exposes the process-wide realtime broker as `app.realtime`. It owns a single
 * LISTEN connection, opened lazily on the first SSE subscriber.
 */
export const realtimePlugin = fp(
  async (app) => {
    const broker = createRealtimeBroker({
      databaseUrl: app.config.DATABASE_URL,
      log: { warn: (obj, message) => app.log.warn(obj, message) },
    });

    app.decorate('realtime', broker);

    app.addHook('onClose', async () => {
      await broker.close();
    });
  },
  { name: 'traceback-realtime', dependencies: ['traceback-db'] },
);
