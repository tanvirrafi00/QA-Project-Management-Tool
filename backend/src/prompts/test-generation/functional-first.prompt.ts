/**
 * Functional-First Coverage Prompt.
 *
 * Implements the core principle of the functional-first strategy: 100% FUNCTIONAL COVERAGE of the
 * requirement comes FIRST. This prompt drives a dedicated functional-only generation pass that
 * covers every functional requirement with detailed, business-context-aware, module-consistent
 * test-case names. No UI/API/security/negative/boundary cases are produced here — those are the
 * secondary dimensions generated only AFTER functional coverage is complete.
 */

import { TEST_CASE_FORMAT } from './format.prompt';
import type { ParsedRequirement } from '../../shared/types';

export interface FunctionalFirstPromptInput {
    requirement: ParsedRequirement;
    /** Normalized requirement markdown (full context for the model). */
    markdown: string;
    /** The EXACT module name the user typed — used verbatim in every test-case name. */
    module: string;
    /** Minimum functional test cases to produce (the floor). */
    targetCount: number;
    /** Coverage depth label (steers how deep to go). */
    coverageLabel: string;
}

/**
 * Build the functional-first system + user prompts. The system prompt encodes the strict
 * functional-coverage-first rules and the naming rule; the user prompt enumerates every discrete
 * functional requirement so the model can map each to at least one functional test case.
 */
export function buildFunctionalFirstPrompt({
    requirement,
    markdown,
    module,
    targetCount,
    coverageLabel,
}: FunctionalFirstPromptInput): { system: string; user: string } {
    // Enumerate the discrete, testable FUNCTIONAL requirements explicitly. Each must map to ≥1
    // functional test case — this is what drives 100% functional coverage.
    const functionalItems: string[] = [
        ...(requirement.workflows ?? []).map((r) => `WORKFLOW / ACCEPTANCE CRITERION: ${r}`),
        ...(requirement.businessRules ?? []).map((r) => `BUSINESS RULE: ${r}`),
        ...(requirement.validations ?? []).map((r) => `FUNCTIONAL VALIDATION RULE: ${r}`),
        ...(requirement.permissions ?? []).map((r) => `ROLE-BASED ACTION: ${r}`),
        ...(requirement.fields ?? []).map(
            (f) => `FIELD / INPUT-OUTPUT RULE: ${f.name}${f.rules?.length ? ` (rules: ${f.rules.join('; ')})` : ''}`,
        ),
        ...(requirement.actors ?? []).map((a) => `ACTOR (cover this role's functional flows): ${a}`),
    ];
    const reqBlock =
        functionalItems.length > 0
            ? functionalItems.map((r, i) => `${i + 1}. ${r}`).join('\n')
            : '(No structured functional requirements extracted — derive every testable functional requirement from the requirement text below and cover each.)';

    const system = `You are a Senior QA Architect executing a FUNCTIONAL-FIRST coverage strategy. Your ONLY goal in this pass is 100% FUNCTIONAL COVERAGE of the requirement.

ABSOLUTE RULES:
1. FUNCTIONAL ONLY: Generate ONLY functional test cases. Set every "type" to "functional". Do NOT produce UI, API, security, negative, boundary, or edge cases in this pass — those are generated later.
2. COVER EVERYTHING FUNCTIONAL: Every acceptance criterion, business rule, user action, system behavior, end-to-end workflow, role-based action, state transition, input/output rule, and functional validation rule must have AT LEAST ONE functional test case that directly verifies it.
3. NAMING RULE (STRICT — THIS IS CRITICAL): Every test case "name" MUST be:
   - Detailed and specific to the business behavior being verified.
   - Business-context-aware (mention the condition, the action, and the expected outcome).
   - Module-consistent: every name MUST reference the module name "${module}".
   - NEVER generic. NEVER one or two words.
   BAD names (FORBIDDEN): "Test login", "Check registration", "Verify field", "Happy path", "Create user".
   GOOD names (FOLLOW THIS PATTERN):
     - "Verify that a new user cannot log in until admin approval changes status from PENDING_APPROVAL to ACTIVE in ${module}"
     - "Verify that the system sends a confirmation email when a user completes registration in ${module}"
     - "Verify that an Editor can publish a draft but a Viewer cannot in ${module}"
4. Each test case: 2-4 brief numbered steps, one concrete expected result, priority Critical|High|Medium|Low.
5. MEET THE FLOOR: produce AT LEAST ${targetCount} functional test cases. If covering every requirement yields fewer, DEEPEN functional coverage — add more workflow variations, role-based flows, state transitions, real-world scenarios, and business validations. NEVER pad with generic or duplicate cases.
6. No two test cases may verify the same behavior — each must probe a distinct functional aspect.

Coverage depth: "${coverageLabel}".

${TEST_CASE_FORMAT}

Return ONLY valid JSON (no markdown fences):
{"testCases":[{"name":"Verify that ... in ${module}","type":"functional","priority":"...","steps":["1. ...","2. ..."],"expectedResult":"..."}],"reasoning":"one-line summary of functional coverage"}`;

    const user = `Module (use EXACTLY this name in every test case): ${module}
Feature: ${requirement.feature}
Actors: ${requirement.actors?.join(', ') || 'N/A'}

FUNCTIONAL REQUIREMENTS TO COVER (write AT LEAST ONE functional test case for EACH, in order — every one must be covered):
${reqBlock}

Full requirement:
${markdown}`;

    return { system, user };
}
