/**
 * Prompt: Coverage Validation Agent
 * Validates test coverage and identifies gaps
 */

import { AgentTestCase, ParsedRequirement } from '../../shared/types';

export function coveragePrompt(req: ParsedRequirement, testCases: AgentTestCase[]) {
    return {
        system: `You are a Test Coverage Analyst. Analyze test cases against requirements and provide a coverage report.

Return JSON ONLY:
{
  "coveragePercentage": number (0-100),
  "coveredAreas": ["list of well-covered areas"],
  "gaps": ["list of uncovered areas/fields"],
  "recommendations": ["suggestions to improve coverage"]
}

Be precise and critical. Only count areas as covered if there are actual test cases for them.`,

        user: `Analyze coverage for:

Module: ${req.module}
Feature: ${req.feature}
Fields: ${JSON.stringify(req.fields?.map(f => f.name) || [])}
Validations: ${JSON.stringify(req.validations || [])}
Actors: ${JSON.stringify(req.actors || [])}

Test Cases (${testCases.length} total):
${JSON.stringify(testCases.map(tc => ({
            type: tc.type,
            name: tc.name,
            field: tc.module,
        })), null, 2)}`,
    };
}
