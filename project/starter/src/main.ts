import * as dotenv from 'dotenv';

dotenv.config();

import { CodeReviewOrchestrator } from './orchestrator';
import { ReportGenerator } from './utils/report-generator';
import { ReviewError, formatError } from './utils/error-handler';

async function main(): Promise<void> {
  const [owner, repo, prStr] = process.argv.slice(2);

  if (!owner || !repo || !prStr) {
    console.error('Usage: npm run dev -- <owner> <repo> <pr-number>');
    process.exit(1);
  }

  const prNumber = Number(prStr);
  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    console.error('Invalid PR number. Please provide a positive integer.');
    process.exit(1);
  }

  const hasAnthropicKey = Boolean(process.env.ANTHROPIC_API_KEY);
  const hasAwsBedrock = Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
  if (!hasAnthropicKey && !hasAwsBedrock) {
    console.error('Authentication error: provide ANTHROPIC_API_KEY or AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY.');
    process.exit(1);
  }

  const model = process.env.ANTHROPIC_MODEL;
  if (!model) {
    console.error('Missing ANTHROPIC_MODEL in environment.');
    process.exit(1);
  }

  try {
    const orchestrator = new CodeReviewOrchestrator();
    const report = await orchestrator.reviewPullRequest(owner, repo, prNumber);

    const generator = new ReportGenerator();
    const markdownReport = generator.generateMarkdownReport(report);
    const htmlReport = generator.generateHTMLReport(report);
    const jsonReport = generator.generateJSONReport(report);

    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const outputDir = path.resolve(process.cwd(), 'reports');
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(path.join(outputDir, 'report.md'), markdownReport, 'utf8');
    await fs.writeFile(path.join(outputDir, 'report.html'), htmlReport, 'utf8');
    await fs.writeFile(path.join(outputDir, 'report.json'), jsonReport, 'utf8');

    console.log(`✅ Review complete for ${owner}/${repo}#${prNumber}`);
    console.log(`Reports written to ${outputDir}`);
  } catch (error) {
    const message = error instanceof ReviewError ? formatError(error) : error instanceof Error ? error.message : String(error);
    console.error('Error:', message);
    process.exit(1);
  }
}

void main();
