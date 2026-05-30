// Lightweight in-memory rate limiter. Sufficient for single-instance dev +
// a small pilot; swap for Upstash Ratelimit (or Redis sliding window) when
// running multiple web replicas.

import "server-only";

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
}

export function rateLimit(key: string, opts: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
    return { allowed: true, remaining: opts.limit - 1, resetMs: opts.windowMs };
  }
  if (existing.count >= opts.limit) {
    return { allowed: false, remaining: 0, resetMs: existing.resetAt - now };
  }
  existing.count += 1;
  return {
    allowed: true,
    remaining: opts.limit - existing.count,
    resetMs: existing.resetAt - now,
  };
}

/** Periodic GC so buckets don't leak forever under load. */
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, 60_000).unref?.();
