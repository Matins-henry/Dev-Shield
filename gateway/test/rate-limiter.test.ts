import http from 'http';
import { AddressInfo } from 'net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FastifyInstance } from 'fastify';
import { loadEnvConfig } from '../src/config/env.js';
import { buildServer } from '../src/server.js';
import { SlidingWindowRateLimiter } from '../src/limiter/sliding-window.js';
import { RateLimitCheckOptions, RateLimitResult } from '../src/limiter/types.js';

// Test implementation of SlidingWindowRateLimiter for deterministic E2E verification
class MockSlidingWindowLimiter extends SlidingWindowRateLimiter {
  private requestLogs: Map<string, number[]> = new Map();

  public override async check(options: RateLimitCheckOptions): Promise<RateLimitResult> {
    const { key, windowMs, maxRequests } = options;
    const now = Date.now();
    const clearBefore = now - windowMs;

    let timestamps = this.requestLogs.get(key) || [];
    timestamps = timestamps.filter((t) => t > clearBefore);

    if (timestamps.length < maxRequests) {
      timestamps.push(now);
      this.requestLogs.set(key, timestamps);
      const remaining = maxRequests - timestamps.length;
      const resetTimeSeconds = Math.ceil((now + windowMs) / 1000);

      return {
        allowed: true,
        limit: maxRequests,
        remaining,
        resetTimeSeconds,
        retryAfterSeconds: 0,
        currentRequests: timestamps.length,
      };
    } else {
      const oldest = timestamps[0] || now - windowMs;
      const expiresAt = oldest + windowMs;
      const retryAfterSeconds = Math.max(1, Math.ceil((expiresAt - now) / 1000));
      const resetTimeSeconds = Math.ceil(expiresAt / 1000);

      return {
        allowed: false,
        limit: maxRequests,
        remaining: 0,
        resetTimeSeconds,
        retryAfterSeconds,
        currentRequests: timestamps.length,
      };
    }
  }

  public reset(): void {
    this.requestLogs.clear();
  }
}

describe('DevShield Sliding-Window Rate Limiting & HTTP 429 E2E Tests', () => {
  let mockUpstream: http.Server;
  let mockUpstreamUrl: string;
  let gatewayApp: FastifyInstance;
  let gatewayUrl: string;
  let mockLimiter: MockSlidingWindowLimiter;

  beforeAll(async () => {
    // 1. Mock upstream server
    mockUpstream = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', upstream: true }));
    });

    await new Promise<void>((resolve) => {
      mockUpstream.listen(0, '127.0.0.1', () => resolve());
    });

    const port = (mockUpstream.address() as AddressInfo).port;
    mockUpstreamUrl = `http://127.0.0.1:${port}`;

    // 2. Gateway setup with route limited to 3 requests per 2 seconds
    mockLimiter = new MockSlidingWindowLimiter();
    const config = loadEnvConfig();

    gatewayApp = await buildServer({
      config,
      rateLimiter: mockLimiter,
      initialRoutes: [
        {
          id: 'burst-route',
          pathPrefix: '/api/burst',
          upstreamUrl: mockUpstreamUrl,
          stripPrefix: false,
          rateLimit: {
            enabled: true,
            windowMs: 2000, // 2 second window
            maxRequests: 3,  // Limit: 3 requests per 2s
            keyStrategy: 'routeAndIp',
          },
        },
      ],
    });

    await gatewayApp.listen({ port: 0, host: '127.0.0.1' });
    const gwPort = (gatewayApp.server.address() as AddressInfo).port;
    gatewayUrl = `http://127.0.0.1:${gwPort}`;
  });

  afterAll(async () => {
    await gatewayApp.close();
    await new Promise<void>((resolve) => {
      mockUpstream.close(() => resolve());
    });
  });

  it('should allow requests under the threshold and decrement X-RateLimit-Remaining', async () => {
    mockLimiter.reset();

    // Request 1: remaining = 2
    const res1 = await fetch(`${gatewayUrl}/api/burst`, {
      headers: { 'X-Forwarded-For': '192.168.1.100' },
    });
    expect(res1.status).toBe(200);
    expect(res1.headers.get('x-ratelimit-limit')).toBe('3');
    expect(res1.headers.get('x-ratelimit-remaining')).toBe('2');

    // Request 2: remaining = 1
    const res2 = await fetch(`${gatewayUrl}/api/burst`, {
      headers: { 'X-Forwarded-For': '192.168.1.100' },
    });
    expect(res2.status).toBe(200);
    expect(res2.headers.get('x-ratelimit-remaining')).toBe('1');

    // Request 3: remaining = 0
    const res3 = await fetch(`${gatewayUrl}/api/burst`, {
      headers: { 'X-Forwarded-For': '192.168.1.100' },
    });
    expect(res3.status).toBe(200);
    expect(res3.headers.get('x-ratelimit-remaining')).toBe('0');
  });

  it('should trigger HTTP 429 Too Many Requests immediately when burst limit is exceeded', async () => {
    // 4th request from same IP should immediately 429
    const res4 = await fetch(`${gatewayUrl}/api/burst`, {
      headers: { 'X-Forwarded-For': '192.168.1.100' },
    });

    expect(res4.status).toBe(429);
    expect(res4.headers.get('x-ratelimit-remaining')).toBe('0');
    expect(res4.headers.get('retry-after')).toBeDefined();
    expect(Number(res4.headers.get('retry-after'))).toBeGreaterThanOrEqual(1);

    const body = (await res4.json()) as {
      statusCode: number;
      error: string;
      retryAfter: number;
    };
    expect(body.statusCode).toBe(429);
    expect(body.error).toBe('Too Many Requests');
    expect(body.retryAfter).toBeGreaterThanOrEqual(1);
  });

  it('should isolate sliding windows across distinct client IPs', async () => {
    // Client IP 192.168.1.200 is fresh and has not made requests yet
    const freshClientRes = await fetch(`${gatewayUrl}/api/burst`, {
      headers: { 'X-Forwarded-For': '192.168.1.200' },
    });

    expect(freshClientRes.status).toBe(200);
    expect(freshClientRes.headers.get('x-ratelimit-remaining')).toBe('2');
  });

  it('should recover and allow requests again after sliding window duration passes', async () => {
    // Wait for the 2-second window to slide past
    await new Promise((resolve) => setTimeout(resolve, 2100));

    // Request from 192.168.1.100 should now succeed again
    const recoveryRes = await fetch(`${gatewayUrl}/api/burst`, {
      headers: { 'X-Forwarded-For': '192.168.1.100' },
    });

    expect(recoveryRes.status).toBe(200);
    expect(Number(recoveryRes.headers.get('x-ratelimit-remaining'))).toBeGreaterThanOrEqual(1);
  });

  it('should gracefully fail-open when Redis is disconnected and FAIL_OPEN is true', async () => {
    const offlineLimiter = new SlidingWindowRateLimiter(true); // failOpen = true
    const result = await offlineLimiter.check({
      key: 'test:offline',
      windowMs: 60000,
      maxRequests: 10,
    });

    expect(result.allowed).toBe(true);
    expect(result.error).toContain('unavailable; failing open');
  });

  it('should fail-closed when Redis is disconnected and FAIL_OPEN is false', async () => {
    const closedLimiter = new SlidingWindowRateLimiter(false); // failOpen = false
    const result = await closedLimiter.check({
      key: 'test:offline:closed',
      windowMs: 60000,
      maxRequests: 10,
    });

    expect(result.allowed).toBe(false);
    expect(result.error).toContain('unavailable; failing closed');
  });
});
