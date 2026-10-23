export interface RateLimitCheckOptions {
  key: string;
  windowMs: number;
  maxRequests: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetTimeSeconds: number;
  retryAfterSeconds: number;
  currentRequests: number;
  error?: string;
}

export type FallbackMode = 'fail-open' | 'fail-closed';
