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

export class RateLimiter {
  private config: RateLimiterConfig;
  private requestHistory: RequestRecord[] = [];
  private activeRequests = 0;
  private waitQueue: Array<() => void> = [];

  constructor(config: Partial<RateLimiterConfig> = {}) {
    this.config = { ...DEFAULT_RATE_LIMITS, ...config };
  }

  async acquire(estimatedTokens = 1000): Promise<void> {
    while (!this.canProceed(estimatedTokens)) {
      await this.waitForRateLimit(estimatedTokens);
    }

    while (this.activeRequests >= this.config.maxConcurrent) {
      await this.waitForSlot();
    }

    this.activeRequests += 1;
    this.requestHistory.push({ timestamp: Date.now(), tokens: estimatedTokens });
  }

  release(actualTokens?: number): void {
    this.activeRequests = Math.max(0, this.activeRequests - 1);

    if (actualTokens !== undefined && this.requestHistory.length > 0) {
      const lastRequest = this.requestHistory[this.requestHistory.length - 1];
      lastRequest.tokens = actualTokens;
    }

    const next = this.waitQueue.shift();
    if (next) next();
  }

  getStatus() {
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

    const requestsInWindow = this.requestHistory.length;
    const tokensInWindow = this.requestHistory.reduce((sum, record) => sum + record.tokens, 0);

    return (
      this.activeRequests < this.config.maxConcurrent &&
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
    while (!this.canProceed(estimatedTokens)) {
      this.pruneOldRecords();
      if (this.requestHistory.length === 0) break;

      const oldest = this.requestHistory[0];
      const expiration = oldest.timestamp + 60000;
      const waitTime = Math.max(100, Math.min(expiration - Date.now() + 100, 5000));
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  private pruneOldRecords(): void {
    const cutoff = Date.now() - 60000;
    this.requestHistory = this.requestHistory.filter((record) => record.timestamp > cutoff);
  }
}

export function withRateLimit<T>(
  rateLimiter: RateLimiter,
  fn: () => Promise<T>,
  estimatedTokens = 1000,
): Promise<T> {
  return new Promise(async (resolve, reject) => {
    try {
      await rateLimiter.acquire(estimatedTokens);
      const result = await fn();
      rateLimiter.release();
      resolve(result);
    } catch (error) {
      rateLimiter.release();
      reject(error);
    }
  });
}

export const globalRateLimiter = new RateLimiter();
