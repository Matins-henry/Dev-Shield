import Redis, { Redis as RedisClient, RedisOptions } from 'ioredis';
import { SLIDING_WINDOW_LUA } from './lua.js';

export interface CustomRedisClient extends RedisClient {
  slidingWindowCheck(
    key: string,
    now: number,
    windowMs: number,
    maxRequests: number,
    memberId: string
  ): Promise<[number, number, number, number, number]>;
}

let redisInstance: CustomRedisClient | null = null;
let isConnected = false;

export function initializeRedis(redisUrl: string, customOptions: RedisOptions = {}): CustomRedisClient {
  if (redisInstance) {
    return redisInstance;
  }

  const client = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    retryStrategy(times: number): number | null {
      if (times > 10) {
        return null; // Stop retrying after 10 attempts
      }
      return Math.min(times * 100, 2000);
    },
    enableReadyCheck: true,
    lazyConnect: false,
    ...customOptions,
  }) as CustomRedisClient;

  client.on('connect', (): void => {
    isConnected = true;
  });

  client.on('ready', (): void => {
    isConnected = true;
  });

  client.on('close', (): void => {
    isConnected = false;
  });

  client.on('error', (err: Error): void => {
    isConnected = false;
    // Log without throwing to allow fail-open or graceful degradation
    console.error('[Redis Client Error]', err.message);
  });

  client.defineCommand('slidingWindowCheck', {
    numberOfKeys: 1,
    lua: SLIDING_WINDOW_LUA,
  });

  redisInstance = client;
  return client;
}

export function getRedisClient(): CustomRedisClient | null {
  return redisInstance;
}

export function isRedisConnected(): boolean {
  return isConnected && redisInstance !== null && redisInstance.status === 'ready';
}

export async function closeRedis(): Promise<void> {
  if (redisInstance) {
    await redisInstance.quit().catch(() => {
      redisInstance?.disconnect();
    });
    redisInstance = null;
    isConnected = false;
  }
}
