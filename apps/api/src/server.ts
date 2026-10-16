import 'dotenv/config';
import { buildApp } from './app';
import { loadEnv } from './env';
import { createLogger } from './logger';

async function main(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger(env);
  const app = await buildApp({ env, logger });

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      logger.info({ signal }, 'shutting down');
      void app.close().then(() => process.exit(0));
    });
  }

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    logger.info({ port: env.PORT, host: env.HOST }, 'traceback api listening');
  } catch (error) {
    logger.error({ err: error }, 'failed to start');
    process.exit(1);
  }
}

void main();
