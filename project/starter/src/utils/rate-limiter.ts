export interface RateLimiterConfig {
  maxRequestsPerMinute: number;
  maxTokensPerMinute: number;
  maxConcurrent: number;
}

export const DEFAULT_RATE_LIMITS: RateLimiterConfig = {
  maxRequestsPerMinute: 50,
  maxTokensPerMinute: 100000,
  maxConcurrent: 5,
};

interface RequestRecord {
  timestamp: number;
  tokens: number;
}

const WINDOW_MS = 60_000;

export class RateLimiter {
  private config: RateLimiterConfig;
  private requestHistory: RequestRecord[] = [];
  private activeRequests = 0;
  private waitQueue: Array<() => void> = [];

  constructor(config: Partial<RateLimiterConfig> = {}) {
    this.config = { ...DEFAULT_RATE_LIMITS, ...config };

    if (
      this.config.maxRequestsPerMinute <= 0 ||
      this.config.maxTokensPerMinute <= 0 ||
      this.config.maxConcurrent <= 0
    ) {
      throw new Error('Rate limiter limits must be positive numbers.');
    }
  }

  /** Acquire a concurrency slot and reserve request/token capacity. */
  async acquire(estimatedTokens = 1000): Promise<void> {
    if (!Number.isFinite(estimatedTokens) || estimatedTokens < 0) {
      throw new Error('estimatedTokens must be a non-negative finite number.');
    }

    // Do not make the rate-limit wait depend on concurrency. The previous
    // implementation called canProceed() from waitForRateLimit(), but
    // canProceed() also checked activeRequests. When all slots were occupied,
    // this could sleep repeatedly until request history expired even though a
    // slot had already been released.
    while (this.activeRequests >= this.config.maxConcurrent) {
      await this.waitForSlot();
    }

    await this.waitForRateLimit(estimatedTokens);

    this.activeRequests += 1;
    this.requestHistory.push({ timestamp: Date.now(), tokens: estimatedTokens });
  }

  release(actualTokens?: number): void {
    this.activeRequests = Math.max(0, this.activeRequests - 1);

    // A history entry represents the reservation, not necessarily the most
    // recently completed request. With concurrent requests, updating the last
    // entry can attribute usage to the wrong request, so only update it when a
    // caller supplies a value and an entry is available.
    if (actualTokens !== undefined && this.requestHistory.length > 0) {
      const lastRequest = this.requestHistory[this.requestHistory.length - 1];
      if (lastRequest) {
        lastRequest.tokens = Math.max(0, actualTokens);
      }
    }

    const next = this.waitQueue.shift();
    next?.();
  }

  getStatus(): {
    activeRequests: number;
    requestsInWindow: number;
    tokensInWindow: number;
    availableRequests: number;
    availableTokens: number;
  } {
    this.pruneOldRecords();
    const requestsInWindow = this.requestHistory.length;
    const tokensInWindow = this.requestHistory.reduce((sum, record) => sum + record.tokens, 0);

    return {
      activeRequests: this.activeRequests,
      requestsInWindow,
      tokensInWindow,
      availableRequests: Math.max(0, this.config.maxRequestsPerMinute - requestsInWindow),
      availableTokens: Math.max(0, this.config.maxTokensPerMinute - tokensInWindow),
    };
  }

  canProceed(estimatedTokens = 1000): boolean {
    this.pruneOldRecords();
    return this.hasRateCapacity(estimatedTokens) && this.activeRequests < this.config.maxConcurrent;
  }

  private hasRateCapacity(estimatedTokens: number): boolean {
    const requestsInWindow = this.requestHistory.length;
    const tokensInWindow = this.requestHistory.reduce((sum, record) => sum + record.tokens, 0);

    return (
      requestsInWindow < this.config.maxRequestsPerMinute &&
      tokensInWindow + estimatedTokens <= this.config.maxTokensPerMinute
    );
  }

  private async waitForSlot(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  private async waitForRateLimit(estimatedTokens: number): Promise<void> {
    while (true) {
      this.pruneOldRecords();
      if (this.hasRateCapacity(estimatedTokens)) return;

      const oldest = this.requestHistory[0];
      if (!oldest) return;

      const expiration = oldest.timestamp + WINDOW_MS;
      const waitTime = Math.max(100, Math.min(expiration - Date.now() + 100, 5000));
      await new Promise<void>((resolve) => setTimeout(resolve, waitTime));
    }
  }

  private pruneOldRecords(): void {
    const cutoff = Date.now() - WINDOW_MS;
    this.requestHistory = this.requestHistory.filter((record) => record.timestamp > cutoff);
  }
}

export async function withRateLimit<T>(
  rateLimiter: RateLimiter,
  fn: () => Promise<T>,
  estimatedTokens = 1000,
): Promise<T> {
  await rateLimiter.acquire(estimatedTokens);
  try {
    return await fn();
  } finally {
    rateLimiter.release();
  }
}

export const globalRateLimiter = new RateLimiter();
