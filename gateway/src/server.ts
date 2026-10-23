import cors from '@fastify/cors';
import fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { analyticsTracker } from './analytics/tracker.js';
import { EnvConfig } from './config/env.js';
import { defaultRoutes, RouteConfig } from './config/routes.js';
import { applyRateLimitHeaders } from './limiter/headers.js';
import { buildRateLimitKey, getClientIp } from './limiter/key-builder.js';
import { SlidingWindowRateLimiter } from './limiter/sliding-window.js';
import { dispatchProxyRequest } from './proxy/dispatcher.js';
import { ProxyRouter } from './proxy/router.js';
import { healthRoutes } from './routes/health.js';
import { metricsRoutes } from './routes/metrics.js';
import { createRulesRoutes } from './routes/rules.js';

export interface BuildServerOptions {
  config: EnvConfig;
  initialRoutes?: RouteConfig[];
  rateLimiter?: SlidingWindowRateLimiter;
}

export async function buildServer(options: BuildServerOptions): Promise<FastifyInstance> {
  const { config, initialRoutes = defaultRoutes, rateLimiter = new SlidingWindowRateLimiter(config.FAIL_OPEN) } = options;

  const app = fastify({
    trustProxy: true,
    logger: {
      level: config.LOG_LEVEL,
      transport:
        config.NODE_ENV === 'development'
          ? {
              target: 'pino-pretty',
              options: {
                translateTime: 'HH:MM:ss Z',
                ignore: 'pid,hostname',
              },
            }
          : undefined,
    },
    disableRequestLogging: config.NODE_ENV === 'test',
  });

  // Enable Cross-Origin Resource Sharing for the dashboard
  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset', 'Retry-After', 'X-Request-Id'],
  });

  const router = new ProxyRouter(initialRoutes);

  // Register internal administrative endpoints
  await app.register(healthRoutes);
  await app.register(metricsRoutes);
  await app.register(createRulesRoutes(router));

  // Route handler for proxy traffic & rate-limiting across standard HTTP methods
  app.route({
    method: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD'],
    url: '/*',
    handler: async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      const pathname = new URL(request.url, 'http://localhost').pathname;

    // Skip internal endpoints if somehow not matched
    if (pathname === '/health' || pathname.startsWith('/api/metrics') || pathname.startsWith('/api/rules')) {
      return;
    }

    const match = router.match(pathname);
    if (!match) {
      reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `No upstream route registered for path: ${pathname}`,
      });
      return;
    }

    const { route, target } = match;
    const clientIp = getClientIp(request);
    const ipHash = analyticsTracker.hashIp(clientIp);

    // Enforce rate limiting if configured
    if (route.rateLimit.enabled) {
      const key = buildRateLimitKey(request, route.id, route.rateLimit);
      const limitResult = await rateLimiter.check({
        key,
        windowMs: route.rateLimit.windowMs,
        maxRequests: route.rateLimit.maxRequests,
      });

      applyRateLimitHeaders(reply, limitResult);

      if (!limitResult.allowed) {
        analyticsTracker.record({
          routeId: route.id,
          statusCode: 429,
          latencyMs: 1,
          timestamp: Date.now(),
          isBlocked: true,
          clientIpHash: ipHash,
        });

        reply.status(429).send({
          statusCode: 429,
          error: 'Too Many Requests',
          message: `Rate limit exceeded for route '${route.id}'. Please retry in ${limitResult.retryAfterSeconds} seconds.`,
          retryAfter: limitResult.retryAfterSeconds,
          limit: limitResult.limit,
          resetAt: limitResult.resetTimeSeconds,
        });
        return;
      }
    }

    // Forward request upstream via reverse proxy
    const { statusCode, durationMs } = await dispatchProxyRequest(request, reply, target);

    // Record async analytics telemetry
    analyticsTracker.record({
      routeId: route.id,
      statusCode,
      latencyMs: durationMs,
      timestamp: Date.now(),
      isBlocked: false,
      clientIpHash: ipHash,
    });
  },
});

return app;
}
