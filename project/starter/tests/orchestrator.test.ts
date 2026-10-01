import { describe, expect, it } from 'vitest';
import { CodeReviewOrchestrator } from '../src/orchestrator';
import { ReviewReportSchema } from '../src/types/report-types';

describe('CodeReviewOrchestrator', () => {
  it('should initialize with default options', () => {
    const orchestrator = new CodeReviewOrchestrator();
    expect(orchestrator).toBeInstanceOf(CodeReviewOrchestrator);
  });

  it('should accept custom rate limit configuration', () => {
    const orchestrator = new CodeReviewOrchestrator({
      rateLimit: {
        maxRequestsPerMinute: 10,
        maxTokensPerMinute: 5000,
        maxConcurrent: 2,
      },
    });

    const options = orchestrator.getOptions();
    expect(options.rateLimit).toMatchObject({
      maxRequestsPerMinute: 10,
      maxTokensPerMinute: 5000,
      maxConcurrent: 2,
    });
  });

  it('should create a valid review report', async () => {
    const orchestrator = new CodeReviewOrchestrator();
    const report = await orchestrator.reviewPullRequest('owner', 'repo', 123);

    expect(ReviewReportSchema.safeParse(report).success).toBe(true);
    expect(report.pullRequest.number).toBe(123);
    expect(report.summary.totalFiles).toBeGreaterThan(0);
  });
});
