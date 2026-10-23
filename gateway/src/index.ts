import { config } from './config/env.js';
import { closeRedis, initializeRedis } from './limiter/redis.js';
import { buildServer } from './server.js';

async function main(): Promise<void> {
  // Initialize Redis client
  initializeRedis(config.REDIS_URL);

  const server = await buildServer({ config });

  const shutdown = async (signal: string): Promise<void> => {
    server.log.info({ signal }, 'Shutting down DevShield Gateway...');
    try {
      await server.close();
      await closeRedis();
      process.exit(0);
    } catch (err: unknown) {
      server.log.error({ err }, 'Error during graceful shutdown');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    await server.listen({
      port: config.PORT,
      host: config.HOST,
    });
    server.log.info(`DevShield Gateway running at http://${config.HOST}:${config.PORT}`);
  } catch (err: unknown) {
    server.log.error({ err }, 'Failed to start DevShield Gateway');
    process.exit(1);
  }
}

void main();
