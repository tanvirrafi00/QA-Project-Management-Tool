/**
 * Zod Schemas
 * Runtime validation schemas for type-safe data handling
 */

import { z } from 'zod';

/**
 * Test Case Input Schema
 */
export const testCaseInputSchema = z.object({
  moduleName: z.string().optional(),
  featureName: z.string().optional(),
  userStory: z.string().min(10, 'User story must be at least 10 characters'),
  acceptanceCriteria: z.string().optional(),
  businessRules: z.string().optional(),
});

export type TestCaseInput = z.infer<typeof testCaseInputSchema>;

/**
 * Test Case Schema
 */
export const testCaseSchema = z.object({
  id: z.string(),
  type: z.string(),
  scenario: z.string(),
  steps: z.array(z.string()),
  expectedResult: z.string(),
  priority: z.enum(['critical', 'high', 'medium', 'low']),
  tags: z.array(z.string()),
});

export type TestCase = z.infer<typeof testCaseSchema>;

/**
 * Test Coverage Schema
 */
export const testCoverageSchema = z.object({
  score: z.number().min(0).max(100),
  covered: z.array(z.string()),
  missing: z.array(z.string()),
  risks: z.array(z.string()),
});

export type TestCoverage = z.infer<typeof testCoverageSchema>;

/**
 * Test Summary Schema
 */
export const testSummarySchema = z.object({
  totalCases: z.number().int().min(0),
  byType: z.record(z.string(), z.number().int().min(0)),
  byPriority: z.record(z.string(), z.number().int().min(0)),
});

export type TestSummary = z.infer<typeof testSummarySchema>;

/**
 * Test Generation Response Schema
 */
export const testGenerationResponseSchema = z.object({
  feature: z.string(),
  summary: testSummarySchema,
  testCases: z.object({
    scenarios: z.array(testCaseSchema),
    positive: z.array(testCaseSchema),
    negative: z.array(testCaseSchema),
    edge: z.array(testCaseSchema),
    security: z.array(testCaseSchema).optional(),
    boundary: z.array(testCaseSchema).optional(),
  }),
  coverage: testCoverageSchema,
  requirementGaps: z.array(z.string()),
});

export type TestGenerationResponse = z.infer<typeof testGenerationResponseSchema>;

/**
 * Bug Input Schema
 */
export const bugInputSchema = z.object({
  description: z.string().min(10, 'Description must be at least 10 characters'),
  system: z.string().optional(),
  severity: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  category: z.string().optional(),
});

export type BugInput = z.infer<typeof bugInputSchema>;

/**
 * Gap Analysis Input Schema
 */
export const gapAnalysisInputSchema = z.object({
  requirements: z.string().min(10, 'Requirements must be at least 10 characters'),
  existingTests: z.string().optional(),
  context: z.string().optional(),
});

export type GapAnalysisInput = z.infer<typeof gapAnalysisInputSchema>;

/**
 * API Test Input Schema
 */
export const apiTestInputSchema = z.object({
  apiEndpoint: z.string().url('Must provide a valid API endpoint'),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
  requestBody: z.string().optional(),
  authentication: z.string().optional(),
  testType: z.array(z.enum(['functional', 'security', 'performance', 'load'])).optional(),
});

export type ApiTestInput = z.infer<typeof apiTestInputSchema>;

/**
 * Validation helper functions
 */
export const validators = {
  /**
   * Validate test case input
   */
  validateTestCaseInput(data: unknown) {
    return testCaseInputSchema.safeParse(data);
  },

  /**
   * Validate bug input
   */
  validateBugInput(data: unknown) {
    return bugInputSchema.safeParse(data);
  },

  /**
   * Validate gap analysis input
   */
  validateGapAnalysisInput(data: unknown) {
    return gapAnalysisInputSchema.safeParse(data);
  },

  /**
   * Validate API test input
   */
  validateApiTestInput(data: unknown) {
    return apiTestInputSchema.safeParse(data);
  },

  /**
   * Validate test generation response
   */
  validateTestGenerationResponse(data: unknown) {
    return testGenerationResponseSchema.safeParse(data);
  },
};

/**
 * Format validation errors
 */
export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((err) => `${err.path.join('.')}: ${err.message}`)
    .join(', ');
}
