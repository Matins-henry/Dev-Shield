import { AggregatedMetrics, HealthStatus, RouteConfig } from './types';

const GATEWAY_BASE_URL =
  process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:8080';

export async function fetchHealth(): Promise<HealthStatus> {
  try {
    const res = await fetch(`${GATEWAY_BASE_URL}/health`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Health check failed');
    return (await res.json()) as HealthStatus;
  } catch {
    return {
      status: 'offline',
      uptimeSeconds: 0,
      timestamp: new Date().toISOString(),
      redis: { status: 'disconnected' },
      version: '1.0.0',
    };
  }
}

export async function fetchMetrics(): Promise<AggregatedMetrics> {
  try {
    const res = await fetch(`${GATEWAY_BASE_URL}/api/metrics`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch metrics');
    return (await res.json()) as AggregatedMetrics;
  } catch {
    // Graceful fallback for UI preview
    return {
      totalRequests: 14280,
      totalBlocked: 342,
      statusCodes: {
        '2xx': 12850,
        '4xx': 1050,
        '429': 342,
        '5xx': 38,
        other: 0,
      },
      avgLatencyMs: 14,
      p95LatencyMs: 38,
      p99LatencyMs: 82,
      activeRateLimitKeys: 18,
      uptimeSeconds: 7200,
      timestamp: Date.now(),
    };
  }
}

export async function fetchRules(): Promise<RouteConfig[]> {
  try {
    const res = await fetch(`${GATEWAY_BASE_URL}/api/rules`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch rules');
    return (await res.json()) as RouteConfig[];
  } catch {
    return [
      {
        id: 'echo-service',
        pathPrefix: '/api/v1/echo',
        upstreamUrl: 'http://127.0.0.1:8081',
        stripPrefix: false,
        rateLimit: {
          enabled: true,
          windowMs: 10000,
          maxRequests: 10,
          keyStrategy: 'routeAndIp',
        },
      },
      {
        id: 'user-service',
        pathPrefix: '/api/v1/users',
        upstreamUrl: 'http://127.0.0.1:8082',
        stripPrefix: true,
        rateLimit: {
          enabled: true,
          windowMs: 60000,
          maxRequests: 100,
          keyStrategy: 'apiKey',
        },
      },
      {
        id: 'payments-gateway',
        pathPrefix: '/api/v1/checkout',
        upstreamUrl: 'http://127.0.0.1:8083',
        stripPrefix: false,
        rateLimit: {
          enabled: true,
          windowMs: 60000,
          maxRequests: 20,
          keyStrategy: 'ip',
        },
      },
    ];
  }
}

export async function createOrUpdateRule(rule: RouteConfig): Promise<boolean> {
  try {
    const res = await fetch(`${GATEWAY_BASE_URL}/api/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rule),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function simulateTraffic(
  path: string,
  burstCount: number
): Promise<{ success: number; blocked: number; errors: number }> {
  let success = 0;
  let blocked = 0;
  let errors = 0;

  const requests = Array.from({ length: burstCount }, async () => {
    try {
      const res = await fetch(`${GATEWAY_BASE_URL}${path}`, {
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (res.status >= 200 && res.status < 300) success++;
      else if (res.status === 429) blocked++;
      else errors++;
    } catch {
      errors++;
    }
  });

  await Promise.all(requests);
  return { success, blocked, errors };
}
