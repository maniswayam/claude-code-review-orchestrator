import * as dotenv from 'dotenv';
import * as path from 'node:path';

dotenv.config();

import { CodeReviewOrchestrator } from './orchestrator.js';
import { ReportGenerator } from './utils/report-generator.js';
import { ReviewError, formatError } from './utils/error-handler.js';

export type AuthMode = 'anthropic' | 'aws-bedrock';

export interface CliInputs {
  owner: string;
  repo: string;
  prNumber: number;
}

export function parseCliInputs(args: string[]): CliInputs {
  const [owner, repo, prStr] = args;

  if (!owner || !repo || !prStr) {
    throw new ReviewError('Usage: npm run dev -- <owner> <repo> <pr-number>', 'INVALID_CLI_ARGUMENTS');
  }

  const prNumber = Number(prStr);
  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    throw new ReviewError('Invalid PR number. Please provide a positive integer.', 'INVALID_CLI_ARGUMENTS');
  }

  return { owner, repo, prNumber };
}

export function resolveAuthMode(env: NodeJS.ProcessEnv): AuthMode {
  const hasAnthropicKey = Boolean(env.ANTHROPIC_API_KEY);
  const hasAwsBedrock = Boolean(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY);

  if (hasAnthropicKey) {
    return 'anthropic';
  }

  if (hasAwsBedrock) {
    return 'aws-bedrock';
  }

  throw new ReviewError(
    'Authentication error: provide ANTHROPIC_API_KEY or AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY.',
    'MISSING_AUTH',
  );
}

export function validateModel(env: NodeJS.ProcessEnv): string {
  const model = env.ANTHROPIC_MODEL;
  if (!model) {
    throw new ReviewError('Missing ANTHROPIC_MODEL in environment.', 'MISSING_MODEL');
  }

  return model;
}

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export function getReportPaths(owner: string, repo: string, prNumber: number, outputDir: string): {
  markdownPath: string;
  htmlPath: string;
  jsonPath: string;
} {
  const baseName = `${sanitizeSegment(owner)}_${sanitizeSegment(repo)}_pr_${prNumber}`;

  return {
    markdownPath: path.join(outputDir, `${baseName}.md`),
    htmlPath: path.join(outputDir, `${baseName}.html`),
    jsonPath: path.join(outputDir, `${baseName}.json`),
  };
}

export async function runCli(args = process.argv.slice(2), env = process.env): Promise<number> {
  try {
    const { owner, repo, prNumber } = parseCliInputs(args);
    const authMode = resolveAuthMode(env);
    const model = validateModel(env);

    console.log(
      authMode === 'anthropic'
        ? '🔐 Using Anthropic API authentication'
        : '🔐 Using AWS Bedrock authentication',
    );
    console.log(`🚀 Starting review for ${owner}/${repo} PR #${prNumber}`);

    const startedAt = Date.now();
    const orchestrator = new CodeReviewOrchestrator({
      model,
      projectRoot: env.PROJECT_ROOT,
    });

    const report = await orchestrator.reviewPullRequest(owner, repo, prNumber);

    const generator = new ReportGenerator();
    const markdownReport = generator.generateMarkdownReport(report);
    const htmlReport = generator.generateHTMLReport(report);
    const jsonReport = generator.generateJSONReport(report);

    const fs = await import('node:fs/promises');

    const outputDir = path.resolve(process.cwd(), 'reports');
    await fs.mkdir(outputDir, { recursive: true });

    const reportPaths = getReportPaths(owner, repo, prNumber, outputDir);
    await Promise.all([
      fs.writeFile(reportPaths.markdownPath, markdownReport, 'utf8'),
      fs.writeFile(reportPaths.htmlPath, htmlReport, 'utf8'),
      fs.writeFile(reportPaths.jsonPath, jsonReport, 'utf8'),
    ]);

    const duration = Date.now() - startedAt;
    console.log(`✅ Review completed successfully for ${owner}/${repo}#${prNumber}`);
    console.log(`📊 Overall score: ${report.summary.overallScore}/100 | Duration: ${duration}ms`);
    console.log(`📄 Reports: ${reportPaths.markdownPath}, ${reportPaths.htmlPath}, ${reportPaths.jsonPath}`);

    return 0;
  } catch (error) {
    const message = error instanceof ReviewError ? formatError(error) : error instanceof Error ? error.message : String(error);
    console.error(`❌ Review failed: ${message}`);
    return 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli().then((code) => {
    process.exit(code);
  });
}
