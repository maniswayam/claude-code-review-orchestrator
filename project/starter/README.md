# Enterprise Multi-Agent Code Review Orchestrator

This project implements a production-ready multi-agent code review system using the Claude Agent SDK.

## Included

- Agent definitions for code quality, test coverage, and refactoring analysis
- Prompt templates for orchestration and subagents
- MCP configuration for GitHub and ESLint
- Error handling and rate limiting utilities
- Report generation in Markdown, HTML, and JSON
- Unit tests and a runnable CLI entry point

## Quick start

```bash
cd project/starter
cp .env.example .env
npm install
npm run dev -- <owner> <repo> <pr-number>
```
