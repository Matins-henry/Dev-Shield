import { FastifyRequest } from 'fastify';
import { RateLimitRule } from '../config/routes.js';

export function getClientIp(request: FastifyRequest): string {
  const forwardedFor = request.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string') {
    const firstIp = forwardedFor.split(',')[0]?.trim();
    if (firstIp) return firstIp;
  } else if (Array.isArray(forwardedFor) && forwardedFor[0]) {
    const firstIp = forwardedFor[0].split(',')[0]?.trim();
    if (firstIp) return firstIp;
  }

  return request.ip || '127.0.0.1';
}

export function buildRateLimitKey(
  request: FastifyRequest,
  routeId: string,
  rule: RateLimitRule
): string {
  const clientIp = getClientIp(request);

  if (rule.keyStrategy === 'apiKey') {
    const headerName = rule.customHeaderName?.toLowerCase() ?? 'x-api-key';
    const apiKeyHeader = request.headers[headerName];
    const apiKey = typeof apiKeyHeader === 'string' ? apiKeyHeader : 'anonymous';
    return `ratelimit:route:${routeId}:apikey:${apiKey}`;
  }

  if (rule.keyStrategy === 'ip') {
    return `ratelimit:ip:${clientIp}`;
  }

  // Default: routeAndIp
  return `ratelimit:route:${routeId}:ip:${clientIp}`;
}
