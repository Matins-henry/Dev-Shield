import { createHash } from 'crypto';
import { getRedisClient, isRedisConnected } from '../limiter/redis.js';
import { AggregatedMetrics, MetricEvent, StatusCodeCounts } from './types.js';

export class AnalyticsTracker {
  private readonly startTime: number;
  // Local fallback in-memory counters in case Redis is offline
  private inMemoryTotal = 0;
  private inMemoryBlocked = 0;
  private inMemoryStatusCodes: StatusCodeCounts = {
    '2xx': 0,
    '4xx': 0,
    '429': 0,
    '5xx': 0,
    other: 0,
  };
  private inMemoryLatencies: number[] = [];

  public constructor() {
    this.startTime = Date.now();
  }

  public hashIp(ip: string): string {
    return createHash('sha256').update(ip).digest('hex').slice(0, 8);
  }

  public record(event: MetricEvent): void {
    // Fire and forget - never block the main request execution
    setImmediate(async (): Promise<void> => {
      try {
        await this.persistEvent(event);
      } catch (err: unknown) {
        console.warn('[Analytics Record Error]', err instanceof Error ? err.message : String(err));
      }
    });
  }

  private async persistEvent(event: MetricEvent): Promise<void> {
    const { statusCode, latencyMs, isBlocked } = event;
    const redis = getRedisClient();

    // Categorize status code
    let statusCategory: keyof StatusCodeCounts = 'other';
    if (statusCode === 429) {
      statusCategory = '429';
    } else if (statusCode >= 200 && statusCode < 300) {
      statusCategory = '2xx';
    } else if (statusCode >= 400 && statusCode < 500) {
      statusCategory = '4xx';
    } else if (statusCode >= 500 && statusCode < 600) {
      statusCategory = '5xx';
    }

    // Always update local memory ring buffer as fallback and for instant stats
    this.inMemoryTotal++;
    if (isBlocked || statusCode === 429) {
      this.inMemoryBlocked++;
    }
    this.inMemoryStatusCodes[statusCategory]++;
    this.inMemoryLatencies.push(latencyMs);
    if (this.inMemoryLatencies.length > 1000) {
      this.inMemoryLatencies.shift();
    }

    if (!redis || !isRedisConnected()) {
      return;
    }

    const multi = redis.multi();
    multi.hincrby('devshield:metrics:summary', 'totalRequests', 1);
    if (isBlocked || statusCode === 429) {
      multi.hincrby('devshield:metrics:summary', 'totalBlocked', 1);
    }
    multi.hincrby('devshield:metrics:summary', `status:${statusCategory}`, 1);
    multi.hincrby('devshield:metrics:summary', 'latencySum', Math.round(latencyMs));
    multi.hincrby('devshield:metrics:summary', 'latencyCount', 1);

    // Keep recent latencies in a sorted set for percentile calculations
    const now = Date.now();
    multi.zadd('devshield:metrics:latencies', latencyMs, `${now}:${Math.random().toString(36).slice(2, 6)}`);
    // Trim latencies older than 1000 items
    multi.zremrangebyrank('devshield:metrics:latencies', 0, -1001);

    await multi.exec();
  }

  public async getMetrics(): Promise<AggregatedMetrics> {
    const redis = getRedisClient();
    const uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);

    if (redis && isRedisConnected()) {
      try {
        const [summary, latencySamples, rateLimitKeys] = await Promise.all([
          redis.hgetall('devshield:metrics:summary'),
          redis.zrange('devshield:metrics:latencies', 0, -1, 'WITHSCORES'),
          redis.keys('ratelimit:*'),
        ]);

        const totalRequests = Number(summary['totalRequests'] ?? this.inMemoryTotal);
        const totalBlocked = Number(summary['totalBlocked'] ?? this.inMemoryBlocked);
        const latencySum = Number(summary['latencySum'] ?? 0);
        const latencyCount = Number(summary['latencyCount'] ?? 0);

        const statusCodes: StatusCodeCounts = {
          '2xx': Number(summary['status:2xx'] ?? this.inMemoryStatusCodes['2xx']),
          '4xx': Number(summary['status:4xx'] ?? this.inMemoryStatusCodes['4xx']),
          '429': Number(summary['status:429'] ?? this.inMemoryStatusCodes['429']),
          '5xx': Number(summary['status:5xx'] ?? this.inMemoryStatusCodes['5xx']),
          other: Number(summary['status:other'] ?? this.inMemoryStatusCodes['other']),
        };

        const avgLatencyMs = latencyCount > 0 ? Math.round(latencySum / latencyCount) : 0;

        // Parse scores for percentiles
        const scores: number[] = [];
        for (let i = 1; i < latencySamples.length; i += 2) {
          const score = Number(latencySamples[i]);
          if (!isNaN(score)) {
            scores.push(score);
          }
        }
        scores.sort((a, b) => a - b);

        const p95LatencyMs = scores.length > 0
          ? scores[Math.floor(scores.length * 0.95)] ?? scores[scores.length - 1] ?? 0
          : avgLatencyMs;
        const p99LatencyMs = scores.length > 0
          ? scores[Math.floor(scores.length * 0.99)] ?? scores[scores.length - 1] ?? 0
          : avgLatencyMs;

        return {
          totalRequests,
          totalBlocked,
          statusCodes,
          avgLatencyMs,
          p95LatencyMs,
          p99LatencyMs,
          activeRateLimitKeys: rateLimitKeys.length,
          uptimeSeconds,
          timestamp: Date.now(),
        };
      } catch (err: unknown) {
        console.warn('[Analytics getMetrics Error]', err instanceof Error ? err.message : String(err));
      }
    }

    // In-memory fallback
    const latenciesCopy = [...this.inMemoryLatencies].sort((a, b) => a - b);
    const sum = latenciesCopy.reduce((acc, val) => acc + val, 0);
    const avgLatencyMs = latenciesCopy.length > 0 ? Math.round(sum / latenciesCopy.length) : 0;
    const p95LatencyMs = latenciesCopy.length > 0
      ? latenciesCopy[Math.floor(latenciesCopy.length * 0.95)] ?? latenciesCopy[latenciesCopy.length - 1] ?? 0
      : 0;
    const p99LatencyMs = latenciesCopy.length > 0
      ? latenciesCopy[Math.floor(latenciesCopy.length * 0.99)] ?? latenciesCopy[latenciesCopy.length - 1] ?? 0
      : 0;

    return {
      totalRequests: this.inMemoryTotal,
      totalBlocked: this.inMemoryBlocked,
      statusCodes: { ...this.inMemoryStatusCodes },
      avgLatencyMs,
      p95LatencyMs,
      p99LatencyMs,
      activeRateLimitKeys: 0,
      uptimeSeconds,
      timestamp: Date.now(),
    };
  }
}

export const analyticsTracker = new AnalyticsTracker();
