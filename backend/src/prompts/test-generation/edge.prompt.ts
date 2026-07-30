/**
 * Prompt: Edge Case & Boundary QA Agent
 * Generates boundary value and edge scenario tests
 * Optimized for speed: concise directives, structured output
 */

import { ParsedRequirement } from '../../shared/types';
import { TEST_CASE_FORMAT } from './format.prompt';

export function edgePrompt(req: ParsedRequirement) {
    return {
        system: `You are a QA Engineer specializing in boundary value analysis. Generate 10-15 test cases (mix of edge + boundary).

EDGE (type:"edge"): empty/null values, concurrent/race conditions, large payloads, special characters/Unicode, timezone/DST edges, state transitions, network failures, data type mismatches.

BOUNDARY (type:"boundary"): For EACH numeric/length field test: min value, min-1, max value, max+1, zero/negative. For strings: min length, min-1, max length, max+1. For collections: empty, single, max, max+1.

Be systematic. Apply boundary analysis to EVERY constraint.

${TEST_CASE_FORMAT}`,

        user: `Module: ${req.module}
Feature: ${req.feature}
Fields: ${JSON.stringify(req.fields || [])}
Validations: ${req.validations?.join('; ') || 'N/A'}`,
    };
}
