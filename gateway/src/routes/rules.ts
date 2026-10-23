import { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { RouteConfig, RouteConfigSchema } from '../config/routes.js';
import { ProxyRouter } from '../proxy/router.js';

export interface RulesPluginOptions {
  router: ProxyRouter;
}

export const createRulesRoutes = (router: ProxyRouter): FastifyPluginAsync => {
  return async (fastify: FastifyInstance): Promise<void> => {
    fastify.get('/api/rules', async (_request: FastifyRequest, reply: FastifyReply): Promise<RouteConfig[]> => {
      reply.status(200);
      return router.getRoutes();
    });

    fastify.post('/api/rules', async (request: FastifyRequest, reply: FastifyReply): Promise<RouteConfig> => {
      const parsed = RouteConfigSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.status(400);
        throw new Error(`Invalid route configuration: ${parsed.error.message}`);
      }

      const newRoute = parsed.data;
      const currentRoutes = router.getRoutes().filter((r) => r.id !== newRoute.id);
      currentRoutes.push(newRoute);
      router.setRoutes(currentRoutes);

      reply.status(201);
      return newRoute;
    });
  };
};
