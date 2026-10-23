import { randomUUID } from 'crypto';
import { IncomingHttpHeaders } from 'http';
import { FastifyRequest } from 'fastify';

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
]);

export function sanitizeAndPrepareProxyHeaders(
  request: FastifyRequest,
  targetHost: string
): Record<string, string | string[]> {
  const prepared: Record<string, string | string[]> = {};
  const rawHeaders: IncomingHttpHeaders = request.headers;

  for (const [key, value] of Object.entries(rawHeaders)) {
    if (value === undefined || value === null) continue;
    const lowerKey = key.toLowerCase();
    if (!HOP_BY_HOP_HEADERS.has(lowerKey)) {
      if (typeof value === 'string' || Array.isArray(value)) {
        prepared[lowerKey] = value;
      }
    }
  }

  // Preserve or generate X-Request-Id
  const requestId =
    typeof rawHeaders['x-request-id'] === 'string' && rawHeaders['x-request-id'].length > 0
      ? rawHeaders['x-request-id']
      : randomUUID();

  prepared['x-request-id'] = requestId;

  // Append client IP to X-Forwarded-For
  const clientIp = request.ip || '127.0.0.1';
  const existingForwarded = rawHeaders['x-forwarded-for'];
  if (typeof existingForwarded === 'string') {
    prepared['x-forwarded-for'] = `${existingForwarded}, ${clientIp}`;
  } else {
    prepared['x-forwarded-for'] = clientIp;
  }

  // Set X-Forwarded-Proto and Host
  prepared['x-forwarded-proto'] = request.protocol || 'http';
  prepared['host'] = targetHost;

  return prepared;
}
