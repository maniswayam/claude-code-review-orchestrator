# Enterprise Multi-Agent Code Review Orchestrator

Production-style PR review orchestration using Claude Agent SDK, GitHub data, and structured analyzer outputs.

## Setup

```bash
cd project/starter
npm install --legacy-peer-deps
cp .env.example .env
```

Configure `.env`:
- `ANTHROPIC_MODEL` (required)
- `ANTHROPIC_API_KEY` **or** AWS Bedrock credentials
- `GITHUB_TOKEN` (recommended for GitHub API rate limits)
- optionally `PROJECT_ROOT`

## Build

```bash
npm run build
```

## Test

```bash
npm test
```

Tests mock Claude SDK/GitHub interactions and do not require live API calls.

## Development run

```bash
npm run dev -- <owner> <repo> <pr-number>
```

Expected console flow includes:
- authentication mode log (`🔐 Using Anthropic API authentication` or AWS Bedrock)
- start log with owner/repo/PR
- completion log with score, duration, and report paths

## Production run

```bash
npm run build && npm start <owner> <repo> <pr-number>
```

## Reports output

Reports are generated under:

```text
project/starter/reports/
```

Filenames are deterministic:
- `<owner>_<repo>_pr_<number>.md`
- `<owner>_<repo>_pr_<number>.html`
- `<owner>_<repo>_pr_<number>.json`
