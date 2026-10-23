import http from 'http';
import { AddressInfo } from 'net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildServer } from '../src/server.js';
import { loadEnvConfig } from '../src/config/env.js';
import { SlidingWindowRateLimiter } from '../src/limiter/sliding-window.js';

describe('DevShield E2E Proxy Forwarding Tests', () => {
  let mockUpstream: http.Server;
  let mockUpstreamUrl: string;
  let gatewayApp: FastifyInstance;
  let gatewayUrl: string;

  beforeAll(async () => {
    // 1. Spin up an echo mock downstream server on an ephemeral port
    mockUpstream = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        const url = new URL(req.url || '/', 'http://localhost');

        if (url.pathname.endsWith('/error')) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal Server Error' }));
          return;
        }

        res.writeHead(200, {
          'Content-Type': 'application/json',
          'X-Downstream-Echo': 'true',
        });
        res.end(
          JSON.stringify({
            method: req.method,
            path: url.pathname,
            query: Object.fromEntries(url.searchParams.entries()),
            headers: req.headers,
            body: body ? JSON.parse(body) : null,
          })
        );
      });
    });

    await new Promise<void>((resolve) => {
      mockUpstream.listen(0, '127.0.0.1', () => resolve());
    });

    const upstreamPort = (mockUpstream.address() as AddressInfo).port;
    mockUpstreamUrl = `http://127.0.0.1:${upstreamPort}`;

    // 2. Configure and spin up DevShield Gateway
    const config = loadEnvConfig();
    gatewayApp = await buildServer({
      config,
      initialRoutes: [
        {
          id: 'test-echo',
          pathPrefix: '/api/v1/echo',
          upstreamUrl: mockUpstreamUrl,
          stripPrefix: false,
          rateLimit: {
            enabled: false, // Rate limiting tested separately
            windowMs: 60000,
            maxRequests: 100,
            keyStrategy: 'ip',
          },
        },
        {
          id: 'test-stripped',
          pathPrefix: '/proxy/service',
          upstreamUrl: mockUpstreamUrl,
          stripPrefix: true,
          rateLimit: {
            enabled: false,
            windowMs: 60000,
            maxRequests: 100,
            keyStrategy: 'ip',
          },
        },
      ],
    });

    await gatewayApp.listen({ port: 0, host: '127.0.0.1' });
    const gatewayPort = (gatewayApp.server.address() as AddressInfo).port;
    gatewayUrl = `http://127.0.0.1:${gatewayPort}`;
  });

  afterAll(async () => {
    await gatewayApp.close();
    await new Promise<void>((resolve) => {
      mockUpstream.close(() => resolve());
    });
  });

  it('should forward GET requests with query parameters intact', async () => {
    const res = await fetch(`${gatewayUrl}/api/v1/echo?filter=active&limit=10`);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-downstream-echo')).toBe('true');

    const json = (await res.json()) as {
      method: string;
      path: string;
      query: Record<string, string>;
      headers: Record<string, string>;
    };

    expect(json.method).toBe('GET');
    expect(json.path).toBe('/api/v1/echo');
    expect(json.query['filter']).toBe('active');
    expect(json.query['limit']).toBe('10');
  });

  it('should forward POST requests with JSON payload intact', async () => {
    const payload = { message: 'hello devshield', items: [1, 2, 3] };
    const res = await fetch(`${gatewayUrl}/api/v1/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as { method: string; body: typeof payload };
    expect(json.method).toBe('POST');
    expect(json.body).toEqual(payload);
  });

  it('should strip path prefix when configured', async () => {
    const res = await fetch(`${gatewayUrl}/proxy/service/subpath`);
    expect(res.status).toBe(200);

    const json = (await res.json()) as { path: string };
    expect(json.path).toBe('/subpath');
  });

  it('should generate or preserve X-Request-Id header', async () => {
    // 1. Without client request ID - Gateway should generate one
    const resWithoutId = await fetch(`${gatewayUrl}/api/v1/echo`);
    const generatedId = resWithoutId.headers.get('x-request-id');
    expect(generatedId).toBeDefined();
    expect(generatedId?.length).toBeGreaterThan(10);

    // 2. With client request ID - Gateway should preserve it
    const customId = 'req-custom-xyz-12345';
    const resWithId = await fetch(`${gatewayUrl}/api/v1/echo`, {
      headers: { 'x-request-id': customId },
    });
    expect(resWithId.headers.get('x-request-id')).toBe(customId);
  });

  it('should append client IP to X-Forwarded-For header', async () => {
    const res = await fetch(`${gatewayUrl}/api/v1/echo`);
    const json = (await res.json()) as { headers: Record<string, string> };
    expect(json.headers['x-forwarded-for']).toBeDefined();
    expect(json.headers['x-forwarded-proto']).toBe('http');
  });

  it('should deliver downstream HTTP error status codes faithfully', async () => {
    const res = await fetch(`${gatewayUrl}/api/v1/echo/error`);
    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('Internal Server Error');
  });

  it('should return 404 when no matching route is registered', async () => {
    const res = await fetch(`${gatewayUrl}/unregistered/endpoint`);
    expect(res.status).toBe(404);
  });
});
