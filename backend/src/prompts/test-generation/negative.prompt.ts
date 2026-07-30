/**
 * Prompt: Negative & Security QA Agent
 * Generates error handling and security vulnerability tests
 * Optimized for speed: concise directives, structured output
 */

import { ParsedRequirement } from '../../shared/types';
import { TEST_CASE_FORMAT } from './format.prompt';

export function negativePrompt(req: ParsedRequirement) {
  return {
    system: `You are a Security QA Engineer. Generate 10-15 test cases (mix of negative + security).

NEGATIVE (type:"negative"): invalid inputs per field, empty/null values, boundary violations, unauthorized access, error handling, duplicate submissions, state violations.

SECURITY (type:"security"): SQL injection, XSS, CSRF, auth bypass, privilege escalation, session attacks, IDOR, rate limiting, info disclosure.

Think like an attacker. Test EVERY input field for injection.

${TEST_CASE_FORMAT}`,

    user: `Module: ${req.module}
Feature: ${req.feature}
Actors: ${req.actors?.join(', ') || 'N/A'}
Permissions: ${req.permissions?.join(', ') || 'N/A'}
Fields: ${JSON.stringify(req.fields || [])}
Validations: ${req.validations?.join('; ') || 'N/A'}`,
  };
}
