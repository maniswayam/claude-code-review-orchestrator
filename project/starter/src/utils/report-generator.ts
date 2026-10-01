import { ReviewReport } from '../types/report-types';

export class ReportGenerator {
  generateMarkdownReport(report: ReviewReport): string {
    const summary = report.summary;
    return `# 🔍 Code Review Report\n\n## Summary\n- Overall Score: ${summary.overallScore}/100\n- Files Reviewed: ${summary.totalFiles}\n- Critical Issues: ${summary.criticalIssues}\n- Refactoring Opportunities: ${summary.refactoringOpportunities}\n\n## Recommendations\n${report.recommendations.map((rec) => `- [${rec.priority}] ${rec.category}: ${rec.description}`).join('\n')}\n`;
  }

  generateHTMLReport(report: ReviewReport): string {
    const summary = report.summary;
    return `<!doctype html><html><head><meta charset="utf-8" /><title>Code Review Report</title></head><body><h1>Code Review Report</h1><ul><li>Overall Score: ${summary.overallScore}</li><li>Files Reviewed: ${summary.totalFiles}</li></ul></body></html>`;
  }

  generateJSONReport(report: ReviewReport): string {
    return JSON.stringify(report, null, 2);
  }
}
