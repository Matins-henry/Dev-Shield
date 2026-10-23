import { z } from 'zod';

export const RateLimitRuleSchema = z.object({
  enabled: z.boolean().default(true),
  windowMs: z.number().int().positive().default(60000), // 1 minute default
  maxRequests: z.number().int().positive().default(60), // 60 req/min default
  keyStrategy: z.enum(['ip', 'apiKey', 'routeAndIp']).default('routeAndIp'),
  customHeaderName: z.string().optional(),
});

export type RateLimitRule = z.infer<typeof RateLimitRuleSchema>;

export const RouteConfigSchema = z.object({
  id: z.string().min(1),
  pathPrefix: z.string().startsWith('/'),
  upstreamUrl: z.string().url(),
  stripPrefix: z.boolean().default(false),
  rateLimit: RateLimitRuleSchema.default({
    enabled: true,
    windowMs: 60000,
    maxRequests: 60,
    keyStrategy: 'routeAndIp',
  }),
});

export type RouteConfig = z.infer<typeof RouteConfigSchema>;

export const defaultRoutes: RouteConfig[] = [
  {
    id: 'echo-service',
    pathPrefix: '/api/v1/echo',
    upstreamUrl: process.env['DEFAULT_UPSTREAM_URL'] ?? 'http://127.0.0.1:8081',
    stripPrefix: false,
    rateLimit: {
      enabled: true,
      windowMs: 10000, // 10 requests per 10 seconds for testing bursts
      maxRequests: 10,
      keyStrategy: 'routeAndIp',
    },
  },
  {
    id: 'default-proxy',
    pathPrefix: '/proxy',
    upstreamUrl: process.env['DEFAULT_UPSTREAM_URL'] ?? 'http://127.0.0.1:8081',
    stripPrefix: true,
    rateLimit: {
      enabled: true,
      windowMs: 60000,
      maxRequests: 100,
      keyStrategy: 'ip',
    },
  },
];
