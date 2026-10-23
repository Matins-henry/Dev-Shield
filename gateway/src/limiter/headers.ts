import { FastifyReply } from 'fastify';
import { RateLimitResult } from './types.js';

export function applyRateLimitHeaders(reply: FastifyReply, result: RateLimitResult): void {
  reply.header('X-RateLimit-Limit', result.limit.toString());
  reply.header('X-RateLimit-Remaining', Math.max(0, result.remaining).toString());
  reply.header('X-RateLimit-Reset', result.resetTimeSeconds.toString());

  if (!result.allowed) {
    reply.header('Retry-After', result.retryAfterSeconds.toString());
  }
}
