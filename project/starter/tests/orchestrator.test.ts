import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CodeReviewOrchestrator } from '../src/orchestrator';
import { ReviewError } from '../src/utils/error-handler';
import { ReviewReportSchema } from '../src/types/report-types';

const createSuccessResultMessage = (structuredOutput: unknown) => ({
  type: 'result',
  subtype: 'success',
  duration_ms: 1,
  duration_api_ms: 1,
  is_error: false,
  num_turns: 1,
  result: 'ok',
  total_cost_usd: 0,
  usage: {
    input_tokens: 1,
    output_tokens: 1,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    server_tool_use: { web_search_requests: 0 },
  },
  modelUsage: {},
  permission_denials: [],
  structured_output: structuredOutput,
}) as unknown;

function createQueryGenerator(structuredOutput: unknown): AsyncGenerator<unknown, void, unknown> {
  return (async function* () {
    yield createSuccessResultMessage(structuredOutput);
  })();
}

function createGitHubFetchMock(files: Array<{ filename: string; status: string; additions: number; deletions: number; patch?: string }>) {
  return vi.fn(async (url: string) => {
    if (url.endsWith('/pulls/123')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          number: 123,
          title: 'Improve orchestrator',
          body: 'PR description',
          html_url: 'https://example.test/pr/123',
          user: { login: 'octocat' },
          base: { ref: 'main', sha: 'base-sha' },
          head: { ref: 'feature', sha: 'head-sha' },
        }),
      } as Response;
    }

    if (url.includes('/pulls/123/files')) {
      return {
        ok: true,
        status: 200,
        json: async () => files,
      } as Response;
    }

    throw new Error(`Unexpected URL: ${url}`);
  });
}

describe('CodeReviewOrchestrator', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes with default options', () => {
    const orchestrator = new CodeReviewOrchestrator({
      queryFn: vi.fn(),
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });

    expect(orchestrator).toBeInstanceOf(CodeReviewOrchestrator);
  });

  it('accepts custom rate limit configuration', () => {
    const orchestrator = new CodeReviewOrchestrator({
      queryFn: vi.fn(),
      fetchImpl: vi.fn() as unknown as typeof fetch,
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

  it('runs all three analyzers and returns a valid aggregated report', async () => {
    const queryFn = vi
      .fn()
      .mockImplementationOnce(() =>
        createQueryGenerator({
          file: 'src/main.ts',
          issues: [
            {
              line: 10,
              severity: 'medium',
              category: 'best-practice',
              description: 'Add stricter validation',
              suggestion: 'Validate all CLI args.',
            },
          ],
          overallScore: 80,
          summary: 'Quality summary',
        }),
      )
      .mockImplementationOnce(() =>
        createQueryGenerator({
          file: 'src/main.ts',
          hasTests: true,
          testFiles: ['tests/main.test.ts'],
          untestedPaths: [
            {
              type: 'edge-case',
              location: 'invalid auth path',
              priority: 'high',
              reasoning: 'No auth fallback test.',
              suggestedTest: 'Add test for auth error path.',
            },
          ],
          coverageEstimate: 75,
          summary: 'Coverage summary',
        }),
      )
      .mockImplementationOnce(() =>
        createQueryGenerator({
          file: 'src/main.ts',
          suggestions: [
            {
              type: 'simplify',
              location: 'main flow',
              impact: 'medium',
              description: 'Extract logger helper',
              before: 'inline logs',
              after: 'shared helper',
              benefits: 'more maintainable',
            },
          ],
          summary: 'Refactor summary',
        }),
      );

    const fetchImpl = createGitHubFetchMock([
      {
        filename: 'src/main.ts',
        status: 'modified',
        additions: 25,
        deletions: 8,
        patch: '@@ -1 +1 @@',
      },
    ]) as unknown as typeof fetch;

    const orchestrator = new CodeReviewOrchestrator({
      queryFn: queryFn as unknown as typeof import('@anthropic-ai/claude-agent-sdk').query,
      fetchImpl,
      model: 'claude-sonnet-4-5-20250929',
    });

    const report = await orchestrator.reviewPullRequest('owner', 'repo', 123);

    expect(queryFn).toHaveBeenCalledTimes(3);
    expect(ReviewReportSchema.safeParse(report).success).toBe(true);
    expect(report.summary.totalFiles).toBe(1);
    expect(report.summary.highPriorityTests).toBe(1);
    expect(report.recommendations.length).toBeGreaterThan(0);
  });

  it('invokes three subagents in parallel for a file', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const queryFn = vi.fn().mockImplementation((params: { prompt: string }) => {
      const output = params.prompt.includes('missing tests')
        ? {
            file: 'src/main.ts',
            hasTests: true,
            testFiles: ['tests/main.test.ts'],
            untestedPaths: [],
            coverageEstimate: 90,
            summary: 'Coverage ok',
          }
        : params.prompt.includes('improvement opportunities')
          ? {
              file: 'src/main.ts',
              suggestions: [],
              summary: 'No refactors',
            }
          : {
              file: 'src/main.ts',
              issues: [],
              overallScore: 90,
              summary: 'Quality ok',
            };

      return (async function* () {
        await gate;
        yield createSuccessResultMessage(output);
      })();
    });

    const orchestrator = new CodeReviewOrchestrator({
      queryFn: queryFn as unknown as typeof import('@anthropic-ai/claude-agent-sdk').query,
      fetchImpl: createGitHubFetchMock([
        {
          filename: 'src/main.ts',
          status: 'modified',
          additions: 3,
          deletions: 1,
          patch: '@@ -1 +1 @@',
        },
      ]) as unknown as typeof fetch,
      model: 'claude-sonnet-4-5-20250929',
    });

    const reviewPromise = orchestrator.reviewPullRequest('owner', 'repo', 123);

    await vi.waitFor(() => {
      expect(queryFn).toHaveBeenCalledTimes(3);
    });

    release();
    const report = await reviewPromise;
    expect(report.fileReviews[0]?.file).toBe('src/main.ts');
  });

  it('throws a structured output error when analyzer output is invalid', async () => {
    const queryFn = vi.fn().mockImplementation(() => createQueryGenerator({ invalid: 'payload' }));

    const orchestrator = new CodeReviewOrchestrator({
      queryFn: queryFn as unknown as typeof import('@anthropic-ai/claude-agent-sdk').query,
      fetchImpl: createGitHubFetchMock([
        {
          filename: 'src/main.ts',
          status: 'modified',
          additions: 3,
          deletions: 1,
          patch: '@@ -1 +1 @@',
        },
      ]) as unknown as typeof fetch,
      model: 'claude-sonnet-4-5-20250929',
    });

    await expect(orchestrator.reviewPullRequest('owner', 'repo', 123)).rejects.toMatchObject({
      code: 'STRUCTURED_OUTPUT_FAILED',
    });
  });

  it('throws PR_NOT_FOUND when GitHub returns 404', async () => {
    const orchestrator = new CodeReviewOrchestrator({
      queryFn: vi.fn() as unknown as typeof import('@anthropic-ai/claude-agent-sdk').query,
      fetchImpl: (vi.fn(async () => ({ ok: false, status: 404 })) as unknown) as typeof fetch,
    });

    const review = orchestrator.reviewPullRequest('owner', 'repo', 123);
    await expect(review).rejects.toBeInstanceOf(ReviewError);
    await expect(review).rejects.toMatchObject({
      code: 'PR_NOT_FOUND',
    });
  });
});
