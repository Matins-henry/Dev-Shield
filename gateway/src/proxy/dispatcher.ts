import http from 'http';
import https from 'https';
import { FastifyReply, FastifyRequest } from 'fastify';
import { sanitizeAndPrepareProxyHeaders } from './headers.js';
import { ProxyDispatchResult, ProxyTargetResolution } from './types.js';

export async function dispatchProxyRequest(
  request: FastifyRequest,
  reply: FastifyReply,
  target: ProxyTargetResolution
): Promise<ProxyDispatchResult> {
  const startTime = Date.now();
  const upstreamBase = new URL(target.upstreamUrl);
  
  // Construct full destination URL preserving query strings
  const originalUrl = new URL(request.url, 'http://localhost');
  const targetUrl = new URL(target.targetPath + originalUrl.search, upstreamBase.origin);

  const isHttps = upstreamBase.protocol === 'https:';
  const transport = isHttps ? https : http;

  const headers = sanitizeAndPrepareProxyHeaders(request, upstreamBase.host);

  return new Promise<ProxyDispatchResult>((resolve) => {
    reply.hijack();

    const proxyReq = transport.request(
      targetUrl,
      {
        method: request.method,
        headers,
        timeout: 30000,
      },
      (proxyRes: http.IncomingMessage) => {
        const statusCode = proxyRes.statusCode || 502;
        
        // Write downstream headers
        for (const [key, val] of Object.entries(proxyRes.headers)) {
          if (val !== undefined) {
            reply.raw.setHeader(key, val);
          }
        }

        // Write rate limit and Fastify headers
        for (const [key, val] of Object.entries(reply.getHeaders())) {
          if (val !== undefined) {
            reply.raw.setHeader(key, val);
          }
        }

        // Pass X-Request-Id header to client response
        const requestId = headers['x-request-id'];
        if (requestId && typeof requestId === 'string') {
          reply.raw.setHeader('x-request-id', requestId);
        }

        reply.raw.writeHead(statusCode);

        proxyRes.pipe(reply.raw);

        proxyRes.on('end', () => {
          const durationMs = Date.now() - startTime;
          resolve({ statusCode, durationMs });
        });

        proxyRes.on('error', (err: Error) => {
          request.log.error({ err: err.message }, 'Proxy upstream response error');
          const durationMs = Date.now() - startTime;
          resolve({ statusCode: 502, durationMs });
        });
      }
    );

    proxyReq.on('timeout', () => {
      proxyReq.destroy();
      const durationMs = Date.now() - startTime;
      if (!reply.raw.headersSent) {
        reply.raw.writeHead(504, { 'content-type': 'application/json' });
        reply.raw.end(
          JSON.stringify({
            statusCode: 504,
            error: 'Gateway Timeout',
            message: 'Upstream microservice timed out',
          })
        );
      }
      resolve({ statusCode: 504, durationMs });
    });

    proxyReq.on('error', (err: NodeJS.ErrnoException) => {
      request.log.warn({ err: err.message, target: targetUrl.toString() }, 'Proxy connection failed');
      const durationMs = Date.now() - startTime;
      if (!reply.raw.headersSent) {
        // If downstream container is not started locally, return simulated mock echo response
        if (err.code === 'ECONNREFUSED' && (targetUrl.hostname === '127.0.0.1' || targetUrl.hostname === 'localhost')) {
          const combinedHeaders: http.OutgoingHttpHeaders = {
            'content-type': 'application/json',
            'x-downstream-simulated': 'true',
            ...reply.getHeaders(),
          };
          if (requestId && typeof requestId === 'string') {
            combinedHeaders['x-request-id'] = requestId;
          }
          reply.raw.writeHead(200, combinedHeaders);
          reply.raw.end(
            JSON.stringify({
              statusCode: 200,
              message: 'DevShield Downstream Echo (Simulated Upstream)',
              routeId: target.routeId,
              path: target.targetPath,
              method: request.method,
              timestamp: new Date().toISOString(),
            })
          );
          resolve({ statusCode: 200, durationMs });
          return;
        }

        reply.raw.writeHead(502, { 'content-type': 'application/json' });
        reply.raw.end(
          JSON.stringify({
            statusCode: 502,
            error: 'Bad Gateway',
            message: `Failed to connect to upstream service: ${err.message}`,
          })
        );
      }
      resolve({ statusCode: 502, durationMs });
    });

    // Pipe or send request payload from client to upstream
    if (['POST', 'PUT', 'PATCH'].includes(request.method.toUpperCase())) {
      if (request.body !== undefined && request.body !== null) {
        const payload =
          typeof request.body === 'string' || Buffer.isBuffer(request.body)
            ? request.body
            : JSON.stringify(request.body);
        proxyReq.setHeader('content-length', Buffer.byteLength(payload));
        proxyReq.write(payload);
        proxyReq.end();
      } else {
        request.raw.pipe(proxyReq);
      }
    } else {
      proxyReq.end();
    }
  });
}
