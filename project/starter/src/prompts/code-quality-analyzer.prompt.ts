export const codeQualityAnalyzerPrompt = `
Analyze the code for:
- security risks
- performance problems
- maintainability issues
- best-practice violations

Return a structured result containing file-level findings, severity, and clear remediation steps.
`;

export default codeQualityAnalyzerPrompt;
