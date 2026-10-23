import { randomUUID } from 'crypto';
import { getRedisClient, isRedisConnected } from './redis.js';
import { RateLimitCheckOptions, RateLimitResult } from './types.js';

export class SlidingWindowRateLimiter {
  private readonly failOpen: boolean;
  // In-memory sliding-window cache to enforce rate limits even without a local Redis instance
  private inMemoryWindows: Map<string, number[]> = new Map();

  public constructor(failOpen = true) {
    this.failOpen = failOpen;
  }

  public async check(options: RateLimitCheckOptions): Promise<RateLimitResult> {
    const { key, windowMs, maxRequests } = options;
    const now = Date.now();
    const redis = getRedisClient();

    // If Redis is unreachable
    if (!redis || !isRedisConnected()) {
      if (!this.failOpen) {
        return {
          allowed: false,
          limit: maxRequests,
          remaining: 0,
          resetTimeSeconds: Math.ceil((now + windowMs) / 1000),
          retryAfterSeconds: Math.ceil(windowMs / 1000),
          currentRequests: maxRequests,
          error: 'Redis connection unavailable; failing closed',
        };
      }

      const inMemoryResult = this.checkInMemory(options, now);
      return {
        ...inMemoryResult,
        error: 'Redis connection unavailable; failing open',
      };
    }

    try {
      const memberId = `${now}-${randomUUID().slice(0, 8)}`;
      const result = await redis.slidingWindowCheck(
        key,
        now,
        windowMs,
        maxRequests,
        memberId
      );

      const [allowedNum, remaining, retryAfterSeconds, resetTimeSeconds, currentRequests] = result;

      return {
        allowed: allowedNum === 1,
        limit: maxRequests,
        remaining: Number(remaining),
        resetTimeSeconds: Number(resetTimeSeconds),
        retryAfterSeconds: Number(retryAfterSeconds),
        currentRequests: Number(currentRequests),
      };
    } catch (error: unknown) {
      if (!this.failOpen) {
        return {
          allowed: false,
          limit: maxRequests,
          remaining: 0,
          resetTimeSeconds: Math.ceil((now + windowMs) / 1000),
          retryAfterSeconds: Math.ceil(windowMs / 1000),
          currentRequests: maxRequests,
          error: 'Redis connection unavailable; failing closed',
        };
      }

      const inMemoryResult = this.checkInMemory(options, now);
      return {
        ...inMemoryResult,
        error: 'Redis connection unavailable; failing open',
      };
    }
  }

  private checkInMemory(options: RateLimitCheckOptions, now: number): RateLimitResult {
    const { key, windowMs, maxRequests } = options;
    const clearBefore = now - windowMs;

    let timestamps = this.inMemoryWindows.get(key) || [];
    timestamps = timestamps.filter((t) => t > clearBefore);

    if (timestamps.length < maxRequests) {
      timestamps.push(now);
      this.inMemoryWindows.set(key, timestamps);
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
}
