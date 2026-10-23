import { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { analyticsTracker } from '../analytics/tracker.js';
import { AggregatedMetrics } from '../analytics/types.js';

export const metricsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance): Promise<void> => {
  fastify.get('/api/metrics', async (_request: FastifyRequest, reply: FastifyReply): Promise<AggregatedMetrics> => {
    const metrics = await analyticsTracker.getMetrics();
    reply.status(200);
    return metrics;
  });
};
