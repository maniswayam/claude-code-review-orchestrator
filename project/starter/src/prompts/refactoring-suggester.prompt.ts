export const refactoringSuggesterPrompt = `
Identify improvement opportunities in the codebase.
Look for:
- duplicate logic
- long functions
- poor abstraction boundaries
- complexity hotspots

Provide concrete before/after refactoring guidance and expected benefits.
`;

export default refactoringSuggesterPrompt;
