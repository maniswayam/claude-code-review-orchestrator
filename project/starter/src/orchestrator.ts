import { query, type Options as ClaudeQueryOptions, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';

import { codeQualityAnalyzerPrompt } from './prompts/code-quality-analyzer.prompt.js';
import { refactoringSuggesterPrompt } from './prompts/refactoring-suggester.prompt.js';
import { testCoverageAnalyzerPrompt } from './prompts/test-coverage-analyzer.prompt.js';
import {
  CodeQualityResultSchema,
  CodeQualityResultJSONSchema,
  RefactoringSuggestionSchema,
  RefactoringSuggestionJSONSchema,
  TestCoverageResultSchema,
  TestCoverageResultJSONSchema,
  type CodeQualityResult,
  type RefactoringSuggestion,
  type TestCoverageResult,
} from './types/analysis-results.js';
import { ReviewReport, ReviewReportSchema } from './types/report-types.js';
import mcpServersConfig from './config/mcp.config.js';
import { ErrorCodes, ReviewError } from './utils/error-handler.js';
import { RateLimiter, RateLimiterConfig, withRateLimit } from './utils/rate-limiter.js';

export interface OrchestratorOptions {
  rateLimit?: Partial<RateLimiterConfig>;
  maxConcurrency?: number;
  model?: string;
  projectRoot?: string;
  mcpServers?: ClaudeQueryOptions['mcpServers'];
  queryFn?: typeof query;
  fetchImpl?: typeof fetch;
}

interface PullRequestMetadata {
  number: number;
  title: string;
  body: string;
  html_url: string;
  user: { login: string };
  base: { ref: string; sha: string };
  head: { ref: string; sha: string };
}

interface PullRequestFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}

interface PullRequestContext {
  metadata: PullRequestMetadata;
  files: PullRequestFile[];
}

interface RecommendationAccumulator {
  priority: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  description: string;
  files: Set<string>;
}

const MAX_PATCH_CHARS = 4000;
const DEFAULT_ESTIMATED_TOKENS = 4000;

export class CodeReviewOrchestrator {
  private options: OrchestratorOptions;
  private readonly rateLimiter: RateLimiter;
  private readonly queryFn: typeof query;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OrchestratorOptions = {}) {
    this.options = {
      maxConcurrency: 3,
      model: process.env.ANTHROPIC_MODEL,
      projectRoot: process.env.PROJECT_ROOT,
      ...options,
    };

    this.rateLimiter = new RateLimiter({
      maxRequestsPerMinute: 60,
      maxTokensPerMinute: 200000,
      maxConcurrent: this.options.maxConcurrency ?? 3,
      ...(options.rateLimit ?? {}),
    });

    this.queryFn = options.queryFn ?? query;

    if (!options.fetchImpl && typeof globalThis.fetch !== 'function') {
      throw new ReviewError('Fetch API is not available in this runtime.', ErrorCodes.INVALID_CONFIG);
    }

    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  getOptions(): OrchestratorOptions {
    return { ...this.options };
  }

  async reviewPullRequest(owner: string, repo: string, prNumber: number): Promise<ReviewReport> {
    const startedAt = Date.now();
    const context = await this.fetchPullRequestContext(owner, repo, prNumber);

    const fileReviews = await Promise.all(
      context.files.map(async (file) => {
        const [codeQuality, testCoverage, refactorings] = await Promise.all([
          this.runCodeQualityAnalyzer(context.metadata, file),
          this.runTestCoverageAnalyzer(context.metadata, file),
          this.runRefactoringSuggester(context.metadata, file),
        ]);

        return {
          file: file.filename,
          codeQuality,
          testCoverage,
          refactorings,
        };
      }),
    );

    const recommendations = this.collectRecommendations(fileReviews);

    const overallScore =
      fileReviews.length > 0
        ? Math.round(fileReviews.reduce((sum, review) => sum + review.codeQuality.overallScore, 0) / fileReviews.length)
        : 0;

    const report: ReviewReport = {
      pullRequest: {
        owner,
        repo,
        number: prNumber,
      },
      fileReviews,
      summary: {
        totalFiles: fileReviews.length,
        overallScore,
        criticalIssues: fileReviews.reduce(
          (count, review) => count + review.codeQuality.issues.filter((issue) => issue.severity === 'critical').length,
          0,
        ),
        highPriorityTests: fileReviews.reduce(
          (count, review) =>
            count + review.testCoverage.untestedPaths.filter((path) => path.priority === 'critical' || path.priority === 'high').length,
          0,
        ),
        refactoringOpportunities: fileReviews.reduce((count, review) => count + review.refactorings.suggestions.length, 0),
      },
      recommendations,
      metadata: {
        analyzedAt: new Date().toISOString(),
        duration: Date.now() - startedAt,
        agentVersions: {
          orchestrator: '1.0.0',
          'code-quality-analyzer': '1.0.0',
          'test-coverage-analyzer': '1.0.0',
          'refactoring-suggester': '1.0.0',
        },
      },
    };

    const parsedReport = ReviewReportSchema.safeParse(report);
    if (!parsedReport.success) {
      throw new ReviewError(
        `Generated report failed schema validation: ${parsedReport.error.message}`,
        ErrorCodes.VALIDATION_FAILED,
      );
    }

    return parsedReport.data;
  }

  private async runCodeQualityAnalyzer(
    pr: PullRequestMetadata,
    file: PullRequestFile,
  ): Promise<CodeQualityResult> {
    const prompt = `${codeQualityAnalyzerPrompt}\n\nPull request context:\n${this.buildPullRequestContext(pr, file)}`;
    return await this.runStructuredAnalyzer(prompt, CodeQualityResultJSONSchema, CodeQualityResultSchema);
  }

  private async runTestCoverageAnalyzer(
    pr: PullRequestMetadata,
    file: PullRequestFile,
  ): Promise<TestCoverageResult> {
    const prompt = `${testCoverageAnalyzerPrompt}\n\nPull request context:\n${this.buildPullRequestContext(pr, file)}`;
    return await this.runStructuredAnalyzer(prompt, TestCoverageResultJSONSchema, TestCoverageResultSchema);
  }

  private async runRefactoringSuggester(
    pr: PullRequestMetadata,
    file: PullRequestFile,
  ): Promise<RefactoringSuggestion> {
    const prompt = `${refactoringSuggesterPrompt}\n\nPull request context:\n${this.buildPullRequestContext(pr, file)}`;
    return await this.runStructuredAnalyzer(prompt, RefactoringSuggestionJSONSchema, RefactoringSuggestionSchema);
  }

  private async runStructuredAnalyzer<T>(
    prompt: string,
    jsonSchema: Record<string, unknown>,
    schema: { safeParse: (input: unknown) => { success: true; data: T } | { success: false; error: { message: string } } },
  ): Promise<T> {
    return await withRateLimit(this.rateLimiter, async () => {
      const stream = this.queryFn({
        prompt,
        options: {
          model: this.options.model,
          cwd: this.options.projectRoot,
          mcpServers: this.options.mcpServers ?? mcpServersConfig,
          outputFormat: {
            type: 'json_schema',
            schema: jsonSchema,
          },
          maxTurns: 4,
          permissionMode: 'dontAsk',
        },
      });

      let structuredOutput: unknown;
      let resultMessage: SDKMessage | undefined;

      for await (const message of stream) {
        if (message.type === 'result') {
          resultMessage = message;
          if ('structured_output' in message) {
            structuredOutput = message.structured_output;
          }
        }
      }

      if (!resultMessage || resultMessage.type !== 'result') {
        throw new ReviewError('Analyzer did not return a result message.', ErrorCodes.AGENT_FAILED);
      }

      if (resultMessage.subtype !== 'success') {
        throw new ReviewError('Analyzer execution failed.', ErrorCodes.AGENT_FAILED, {
          errors: 'errors' in resultMessage ? resultMessage.errors : undefined,
        });
      }

      const normalizedOutput = this.normalizeStructuredOutput(structuredOutput);
      const parsed = schema.safeParse(normalizedOutput);
      if (!parsed.success) {
        throw new ReviewError(
          `Analyzer output failed schema validation: ${parsed.error.message}`,
          ErrorCodes.STRUCTURED_OUTPUT_FAILED,
        );
      }

      return parsed.data;
    }, DEFAULT_ESTIMATED_TOKENS);
  }

  private normalizeStructuredOutput(output: unknown): unknown {
    if (typeof output !== 'string') {
      return output;
    }

    try {
      return JSON.parse(output) as unknown;
    } catch {
      return output;
    }
  }

  private buildPullRequestContext(pr: PullRequestMetadata, file: PullRequestFile): string {
    const safePatch = (file.patch ?? '').slice(0, MAX_PATCH_CHARS);

    return [
      `PR #${pr.number}: ${pr.title}`,
      `Author: ${pr.user.login}`,
      `Base: ${pr.base.ref} (${pr.base.sha})`,
      `Head: ${pr.head.ref} (${pr.head.sha})`,
      `File: ${file.filename}`,
      `Status: ${file.status}`,
      `Additions: ${file.additions}`,
      `Deletions: ${file.deletions}`,
      `Patch:\n${safePatch || 'No patch available.'}`,
    ].join('\n');
  }

  private async fetchPullRequestContext(owner: string, repo: string, prNumber: number): Promise<PullRequestContext> {
    const headers = this.buildGitHubHeaders();
    const prUrl = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`;

    const prResponse = await this.fetchImpl(prUrl, { headers });
    if (prResponse.status === 404) {
      throw new ReviewError(`Pull request ${owner}/${repo}#${prNumber} was not found.`, ErrorCodes.PR_NOT_FOUND);
    }

    if (!prResponse.ok) {
      throw new ReviewError(`Failed to fetch pull request metadata (status ${prResponse.status}).`, ErrorCodes.GITHUB_API_ERROR);
    }

    const metadata = (await prResponse.json()) as PullRequestMetadata;

    const files: PullRequestFile[] = [];
    for (let page = 1; page <= 10; page += 1) {
      const filesUrl = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100&page=${page}`;
      const filesResponse = await this.fetchImpl(filesUrl, { headers });

      if (!filesResponse.ok) {
        throw new ReviewError(
          `Failed to fetch pull request files (status ${filesResponse.status}).`,
          ErrorCodes.GITHUB_API_ERROR,
        );
      }

      const pageFiles = (await filesResponse.json()) as PullRequestFile[];
      files.push(...pageFiles);

      if (pageFiles.length < 100) {
        break;
      }
    }

    if (files.length === 0) {
      throw new ReviewError('Pull request has no changed files to review.', ErrorCodes.FILE_NOT_FOUND);
    }

    return { metadata, files };
  }

  private buildGitHubHeaders(): Record<string, string> {
    const token = process.env.GITHUB_TOKEN;
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };

    if (token) {
      headers.Authorization = `token ${token}`;
    }

    return headers;
  }

  private collectRecommendations(fileReviews: ReviewReport['fileReviews']): ReviewReport['recommendations'] {
    const recMap = new Map<string, RecommendationAccumulator>();

    const addRecommendation = (
      key: string,
      priority: 'critical' | 'high' | 'medium' | 'low',
      category: string,
      description: string,
      file: string,
    ): void => {
      const existing = recMap.get(key);
      if (existing) {
        existing.files.add(file);
        return;
      }

      recMap.set(key, {
        priority,
        category,
        description,
        files: new Set([file]),
      });
    };

    fileReviews.forEach((review) => {
      review.codeQuality.issues.forEach((issue) => {
        addRecommendation(
          `issue:${issue.category}:${issue.description}`,
          issue.severity === 'info' ? 'low' : issue.severity,
          issue.category,
          `${issue.description} Suggested fix: ${issue.suggestion}`,
          review.file,
        );
      });

      review.testCoverage.untestedPaths.forEach((gap) => {
        addRecommendation(
          `test:${gap.location}:${gap.suggestedTest}`,
          gap.priority,
          'test-coverage',
          `${gap.reasoning} Suggested test: ${gap.suggestedTest}`,
          review.file,
        );
      });

      review.refactorings.suggestions.forEach((suggestion) => {
        addRecommendation(
          `refactor:${suggestion.type}:${suggestion.location}`,
          suggestion.impact === 'high' ? 'high' : suggestion.impact,
          'refactoring',
          `${suggestion.description} Benefit: ${suggestion.benefits}`,
          review.file,
        );
      });
    });

    return Array.from(recMap.values()).map((recommendation) => ({
      priority: recommendation.priority,
      category: recommendation.category,
      description: recommendation.description,
      files: Array.from(recommendation.files).sort(),
    }));
  }
}
