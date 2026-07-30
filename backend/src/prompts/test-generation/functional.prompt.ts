/**
 * Prompt: Functional QA Agent
 * Generates happy path and business logic tests
 * Optimized for speed: concise directives, structured output
 */

import { ParsedRequirement } from '../../shared/types';
import { TEST_CASE_FORMAT } from './format.prompt';

export function functionalPrompt(req: ParsedRequirement) {
    return {
        system: `You are a Senior Functional QA Engineer. Generate 10-15 positive/functional test cases.

Cover: core functionality, business rules, user workflows, field validation, permission/role access, acceptance criteria, data persistence.

For EACH field → 1 positive test. For EACH business rule → 1 verification test. For EACH actor → 1 workflow test.

${TEST_CASE_FORMAT}`,

        user: `Module: ${req.module}
Feature: ${req.feature}
Actors: ${req.actors?.join(', ') || 'N/A'}
Permissions: ${req.permissions?.join(', ') || 'N/A'}
Fields: ${JSON.stringify(req.fields || [])}
Business Rules: ${req.businessRules?.join('; ') || req.constraints?.join('; ') || 'N/A'}`,
    };
}
