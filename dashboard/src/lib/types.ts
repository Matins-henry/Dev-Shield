export interface StatusCodeCounts {
  '2xx': number;
  '4xx': number;
  '429': number;
  '5xx': number;
  other: number;
}

export interface AggregatedMetrics {
  totalRequests: number;
  totalBlocked: number;
  statusCodes: StatusCodeCounts;
  avgLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  activeRateLimitKeys: number;
  uptimeSeconds: number;
  timestamp: number;
}

export interface RateLimitRule {
  enabled: boolean;
  windowMs: number;
  maxRequests: number;
  keyStrategy: 'ip' | 'apiKey' | 'routeAndIp';
  customHeaderName?: string;
}

export interface RouteConfig {
  id: string;
  pathPrefix: string;
  upstreamUrl: string;
  stripPrefix: boolean;
  rateLimit: RateLimitRule;
}

export interface TrafficDataPoint {
  time: string;
  requests: number;
  blocked: number;
  latency: number;
}

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'offline';
  uptimeSeconds: number;
  timestamp: string;
  redis: {
    status: 'connected' | 'disconnected';
  };
  version: string;
}
