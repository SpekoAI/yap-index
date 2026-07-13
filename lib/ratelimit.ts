export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterMs: number;
};

export interface RateLimiter {
  consume(key: string, cost?: number, nowMs?: number): Promise<RateLimitResult>;
}

type Bucket = {
  tokens: number;
  updatedAtMs: number;
  lastSeenAtMs: number;
};

export type InMemoryTokenBucketOptions = {
  capacity: number;
  refillTokens: number;
  refillIntervalMs: number;
  idleTtlMs?: number;
};

export class InMemoryTokenBucket implements RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly capacity: number;
  private readonly refillPerMs: number;
  private readonly idleTtlMs: number;
  private operationCount = 0;

  constructor(options: InMemoryTokenBucketOptions) {
    if (
      options.capacity <= 0 ||
      options.refillTokens <= 0 ||
      options.refillIntervalMs <= 0
    ) {
      throw new Error("token bucket values must be positive");
    }
    this.capacity = options.capacity;
    this.refillPerMs = options.refillTokens / options.refillIntervalMs;
    this.idleTtlMs = options.idleTtlMs ?? 60 * 60_000;
  }

  async consume(
    key: string,
    cost = 1,
    nowMs = Date.now(),
  ): Promise<RateLimitResult> {
    if (!key || !Number.isFinite(cost) || cost <= 0 || cost > this.capacity) {
      throw new Error("rate limit key and cost must be valid");
    }

    this.operationCount += 1;
    if (this.operationCount % 100 === 0) {
      this.prune(nowMs);
    }

    const existing = this.buckets.get(key) ?? {
      tokens: this.capacity,
      updatedAtMs: nowMs,
      lastSeenAtMs: nowMs,
    };
    const elapsedMs = Math.max(0, nowMs - existing.updatedAtMs);
    const tokens = Math.min(
      this.capacity,
      existing.tokens + elapsedMs * this.refillPerMs,
    );
    const allowed = tokens >= cost;
    const tokensAfter = allowed ? tokens - cost : tokens;
    this.buckets.set(key, {
      tokens: tokensAfter,
      updatedAtMs: Math.max(existing.updatedAtMs, nowMs),
      lastSeenAtMs: nowMs,
    });

    return {
      allowed,
      limit: this.capacity,
      remaining: Math.max(0, Math.floor(tokensAfter)),
      retryAfterMs: allowed
        ? 0
        : Math.ceil((cost - tokensAfter) / this.refillPerMs),
    };
  }

  private prune(nowMs: number): void {
    for (const [key, bucket] of this.buckets) {
      if (nowMs - bucket.lastSeenAtMs > this.idleTtlMs) {
        this.buckets.delete(key);
      }
    }
  }
}
