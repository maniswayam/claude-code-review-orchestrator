import { afterEach, describe, expect, it, vi } from 'vitest';

import { RateLimiter, withRateLimit } from '../src/utils/rate-limiter';

describe('RateLimiter', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('blocks when max concurrency is reached and resumes after release', async () => {
    const limiter = new RateLimiter({ maxRequestsPerMinute: 10, maxTokensPerMinute: 10000, maxConcurrent: 1 });

    await limiter.acquire(10);

    let acquired = false;
    const waitingAcquire = limiter.acquire(10).then(() => {
      acquired = true;
    });

    await Promise.resolve();
    expect(acquired).toBe(false);

    limiter.release(10);
    await waitingAcquire;
    expect(acquired).toBe(true);
  });

  it('enforces sliding-window request capacity', async () => {
    vi.useFakeTimers();

    const limiter = new RateLimiter({ maxRequestsPerMinute: 1, maxTokensPerMinute: 10000, maxConcurrent: 2 });
    await limiter.acquire(10);

    let completed = false;
    const secondAcquire = limiter.acquire(10).then(() => {
      completed = true;
    });

    await vi.advanceTimersByTimeAsync(59_000);
    expect(completed).toBe(false);

    await vi.advanceTimersByTimeAsync(2_000);
    await secondAcquire;
    expect(completed).toBe(true);
  });

  it('validates estimated token values', async () => {
    const limiter = new RateLimiter();
    await expect(limiter.acquire(-1)).rejects.toThrow('estimatedTokens must be a non-negative finite number.');
  });

  it('cleans up active request tracking in withRateLimit even on failure', async () => {
    const limiter = new RateLimiter({ maxRequestsPerMinute: 10, maxTokensPerMinute: 10000, maxConcurrent: 1 });

    await expect(
      withRateLimit(
        limiter,
        async () => {
          throw new Error('boom');
        },
        10,
      ),
    ).rejects.toThrow('boom');

    expect(limiter.getStatus().activeRequests).toBe(0);
  });
});
