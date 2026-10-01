export const refactoringSuggester = {
  name: 'refactoring-suggester',
  description: 'Finds refactoring opportunities to improve long-term maintainability.',
  instructions: [
    'Highlight duplication, complex branching, and abstraction opportunities.',
    'Recommend small, safe refactors with explicit benefits.',
    'Avoid large rewrites that increase risk without enough gain.',
  ],
};

export default refactoringSuggester;
