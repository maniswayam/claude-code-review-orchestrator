import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  CodeQualityResultSchema,
  TestCoverageResultSchema,
  RefactoringSuggestionSchema,
} from './analysis-results';

export const ReviewReportSchema = z.object({
  pullRequest: z.object({
    owner: z.string(),
    repo: z.string(),
    number: z.number(),
  }),
  fileReviews: z.array(
    z.object({
      file: z.string(),
      codeQuality: CodeQualityResultSchema,
      testCoverage: TestCoverageResultSchema,
      refactorings: RefactoringSuggestionSchema,
    }),
  ),
  summary: z.object({
    totalFiles: z.number(),
    overallScore: z.number(),
    criticalIssues: z.number(),
    highPriorityTests: z.number(),
    refactoringOpportunities: z.number(),
  }),
  recommendations: z.array(
    z.object({
      priority: z.enum(['critical', 'high', 'medium', 'low']),
      category: z.string(),
      description: z.string(),
      files: z.array(z.string()),
    }),
  ),
  metadata: z.object({
    analyzedAt: z.string(),
    duration: z.number(),
    agentVersions: z.record(z.string()),
  }),
});

export type ReviewReport = z.infer<typeof ReviewReportSchema>;

type JsonSchema = Record<string, unknown>;
const toJsonSchema = (schema: z.ZodTypeAny): JsonSchema =>
  (zodToJsonSchema as (s: unknown, options?: unknown) => unknown)(schema, { $refStrategy: 'root' }) as JsonSchema;

const rawSchema: JsonSchema = toJsonSchema(ReviewReportSchema);
export const ReviewReportJSONSchema = rawSchema;
