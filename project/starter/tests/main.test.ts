import { describe, expect, it } from 'vitest';

import { getReportPaths, parseCliInputs, resolveAuthMode, validateModel } from '../src/main';

describe('CLI helpers', () => {
  it('validates required CLI arguments', () => {
    expect(() => parseCliInputs(['owner', 'repo'])).toThrow('Usage: npm run dev -- <owner> <repo> <pr-number>');
    expect(() => parseCliInputs(['owner', 'repo', 'abc'])).toThrow('Invalid PR number');
    expect(parseCliInputs(['owner', 'repo', '12'])).toEqual({ owner: 'owner', repo: 'repo', prNumber: 12 });
  });

  it('resolves authentication mode', () => {
    expect(resolveAuthMode({ ANTHROPIC_API_KEY: 'x' } as NodeJS.ProcessEnv)).toBe('anthropic');
    expect(
      resolveAuthMode({ AWS_ACCESS_KEY_ID: 'id', AWS_SECRET_ACCESS_KEY: 'secret' } as NodeJS.ProcessEnv),
    ).toBe('aws-bedrock');
    expect(() => resolveAuthMode({} as NodeJS.ProcessEnv)).toThrow('Authentication error');
  });

  it('validates model configuration', () => {
    expect(() => validateModel({} as NodeJS.ProcessEnv)).toThrow('Missing ANTHROPIC_MODEL');
    expect(validateModel({ ANTHROPIC_MODEL: 'claude-sonnet-4-5-20250929' } as NodeJS.ProcessEnv)).toBe(
      'claude-sonnet-4-5-20250929',
    );
  });

  it('generates deterministic report paths', () => {
    const paths = getReportPaths('owner-name', 'repo/name', 42, '/tmp/reports');

    expect(paths.markdownPath).toBe('/tmp/reports/owner-name_repo_name_pr_42.md');
    expect(paths.htmlPath).toBe('/tmp/reports/owner-name_repo_name_pr_42.html');
    expect(paths.jsonPath).toBe('/tmp/reports/owner-name_repo_name_pr_42.json');
  });
});
