import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FastifyInstance } from 'fastify';
import { loadEnvConfig } from '../src/config/env.js';
import { buildServer } from '../src/server.js';
import { AggregatedMetrics } from '../src/analytics/types.js';
import { RouteConfig } from '../src/config/routes.js';

describe('DevShield Admin & Metrics API Tests', () => {
  let gatewayApp: FastifyInstance;

  beforeAll(async () => {
    const config = loadEnvConfig();
    gatewayApp = await buildServer({ config });
    await gatewayApp.ready();
  });

  afterAll(async () => {
    await gatewayApp.close();
  });

  it('should return 200 OK from /health', async () => {
    const res = await gatewayApp.inject({
      method: 'GET',
      url: '/health',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      status: string;
      version: string;
      uptimeSeconds: number;
      redis: { status: string };
    };

    expect(body.version).toBe('1.0.0');
    expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(body.redis).toBeDefined();
  });

  it('should return aggregated metrics from /api/metrics', async () => {
    const res = await gatewayApp.inject({
      method: 'GET',
      url: '/api/metrics',
    });

    expect(res.statusCode).toBe(200);
    const metrics = JSON.parse(res.body) as AggregatedMetrics;

    expect(metrics).toHaveProperty('totalRequests');
    expect(metrics).toHaveProperty('totalBlocked');
    expect(metrics).toHaveProperty('statusCodes');
    expect(metrics).toHaveProperty('avgLatencyMs');
  });

  it('should allow querying and registering dynamic routes via /api/rules', async () => {
    // 1. Get initial routes
    const getRes = await gatewayApp.inject({
      method: 'GET',
      url: '/api/rules',
    });
    expect(getRes.statusCode).toBe(200);
    const initialRoutes = JSON.parse(getRes.body) as RouteConfig[];
    expect(Array.isArray(initialRoutes)).toBe(true);

    // 2. Add a new dynamic route
    const newRoute: RouteConfig = {
      id: 'dynamic-user-service',
      pathPrefix: '/api/v2/users',
      upstreamUrl: 'http://127.0.0.1:9090',
      stripPrefix: true,
      rateLimit: {
        enabled: true,
        windowMs: 30000,
        maxRequests: 50,
        keyStrategy: 'apiKey',
      },
    };

    const postRes = await gatewayApp.inject({
      method: 'POST',
      url: '/api/rules',
      payload: newRoute,
    });

    expect(postRes.statusCode).toBe(201);
    const created = JSON.parse(postRes.body) as RouteConfig;
    expect(created.id).toBe('dynamic-user-service');

    // 3. Verify route list now contains the dynamic route
    const listRes = await gatewayApp.inject({
      method: 'GET',
      url: '/api/rules',
    });
    const updatedRoutes = JSON.parse(listRes.body) as RouteConfig[];
    expect(updatedRoutes.some((r) => r.id === 'dynamic-user-service')).toBe(true);
  });
});
