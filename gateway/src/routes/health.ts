import { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { isRedisConnected } from '../limiter/redis.js';

interface HealthResponse {
  status: 'ok' | 'degraded';
  uptimeSeconds: number;
  timestamp: string;
  redis: {
    status: 'connected' | 'disconnected';
  };
  version: string;
}

export const healthRoutes: FastifyPluginAsync = async (fastify: FastifyInstance): Promise<void> => {
  fastify.get('/health', async (_request: FastifyRequest, reply: FastifyReply): Promise<HealthResponse> => {
    const redisOk = isRedisConnected();
    const response: HealthResponse = {
      status: redisOk ? 'ok' : 'degraded',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      redis: {
        status: redisOk ? 'connected' : 'disconnected',
      },
      version: '1.0.0',
    };

    reply.status(200);
    return response;
  });
};
