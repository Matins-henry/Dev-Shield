export interface MetricEvent {
  routeId: string;
  statusCode: number;
  latencyMs: number;
  timestamp: number;
  isBlocked: boolean;
  clientIpHash: string;
}

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
