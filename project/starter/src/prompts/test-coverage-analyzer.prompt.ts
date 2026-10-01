export const testCoverageAnalyzerPrompt = `
Review the code and identify missing tests.
Focus on:
- branch coverage gaps
- edge cases
- null/empty/error paths
- public APIs and user-facing behavior

Return a structured recommendation list with suggested tests.
`;

export default testCoverageAnalyzerPrompt;
