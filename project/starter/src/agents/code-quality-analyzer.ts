export const codeQualityAnalyzer = {
  name: 'code-quality-analyzer',
  description: 'Analyzes source files for maintainability, security, and performance issues.',
  instructions: [
    'Inspect source files for anti-patterns and risky code.',
    'Flag security issues, maintainability problems, and performance bottlenecks.',
    'Use TypeScript and JavaScript best practices when making recommendations.',
  ],
};

export const testCoverageAnalyzer = {
  name: 'test-coverage-analyzer',
  description: 'Reviews missing test coverage and suggests test cases for untested behavior.',
  instructions: [
    'Find uncovered branches, functions, and edge cases.',
    'Suggest realistic tests and prioritize them by risk.',
    'Prefer minimal but high-value test additions.',
  ],
};

export const refactoringSuggester = {
  name: 'refactoring-suggester',
  description: 'Suggests maintainable refactors and architectural cleanup opportunities.',
  instructions: [
    'Identify code that is difficult to maintain or scales poorly.',
    'Recommend concrete before/after refactoring patterns.',
    'Keep suggestions focused on quality and clarity.',
  ],
};

export { codeQualityAnalyzer, testCoverageAnalyzer, refactoringSuggester };
