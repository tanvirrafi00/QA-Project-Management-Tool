/**
 * Type-specific generation prompts. One builder per generatable test type — each asks the model to
 * act as a Senior QA Architect and produce a TARGET number of cases for THAT type only, so coverage
 * is balanced across the user's selected types (no single category dominates).
 *
 * Used by the type-batched orchestrator: one generation pass per selected type, then merge + dedup.
 */

import { TEST_TYPE_LABELS } from '../../shared/constants';
import { TEST_CASE_FORMAT } from './format.prompt';
import type { ParsedRequirement } from '../../shared/types';

/** Per-type focus guidance — keeps each pass anchored to its category. */
const TYPE_GUIDANCE: Record<string, string> = {
    functional:
        'Core happy-path functionality, business rules, user workflows, field behavior, and acceptance criteria. Every functional requirement maps to ≥1 test.',
    ui: 'UI/UX: layout/rendering, responsiveness, navigation, form interactions, visual states, and control affordances.',
    validation:
        'Input validation: required fields, format/length/range rules, invalid-format rejection, and clear error messaging.',
    boundary:
        'Boundary value analysis: for every numeric/length constraint test min, min−1, max, max+1, zero/negative, empty, and oversized values.',
    negative:
        'Negative paths: invalid inputs, unauthorized access, error handling, duplicate submissions, and illegal state transitions.',
    security:
        'Security: injection (SQLi/XSS), authentication/authorization bypass, privilege escalation, session attacks, IDOR, rate limiting, and information disclosure.',
    api: 'API/contract: endpoints, HTTP methods, status codes, request/response payloads, auth headers, versioning, and error envelopes.',
    permission:
        'Role/permission: each actor × each guarded action — allow for authorized roles, deny for unauthorized, and prevent privilege escalation.',
    workflow:
        'End-to-end workflows: multi-step sequences, state transitions, ordering dependencies, and rollback/retry behavior.',
    integration:
        'Integration: upstream/downstream systems, data synchronization, contract conformance, timeouts/retries, and idempotency.',
    data_integrity:
        'Data integrity: persistence, transactions, concurrency, constraints, cascades, and recovery/cleanup.',
    performance:
        'Performance: load, response time, throughput, large datasets, caching behavior, and graceful degradation under stress.',
    accessibility:
        'Accessibility: keyboard navigation, focus management, color contrast, ARIA semantics, screen-reader support, and zoom.',
};

export interface TypePromptInput {
    type: string;
    requirement: ParsedRequirement;
    /** Normalized requirement markdown (full context for the model). */
    markdown: string;
    targetCount: number;
}

export function typePrompt({ type, requirement, markdown, targetCount }: TypePromptInput): {
    system: string;
    user: string;
} {
    const label = TEST_TYPE_LABELS[type] ?? type;
    const guidance = TYPE_GUIDANCE[type] ?? 'Generate thorough, distinct test cases for this category.';

    return {
        system: `You are a Senior QA Architect. Generate ${targetCount} or more high-quality ${label} test cases for the requirement below.

Focus ONLY on ${label} testing:
${guidance}

Rules:
- Produce at least ${targetCount} test cases (more only if the requirement clearly demands it).
- Every test case must be specific, actionable, and traceable to the requirement.
- Set every test case's "type" to "${type}".
- Do not repeat scenarios — each case must probe a distinct aspect.

${TEST_CASE_FORMAT}`,
        user: `Module: ${requirement.module}
Feature: ${requirement.feature}
Actors: ${requirement.actors?.join(', ') || 'N/A'}
Permissions: ${requirement.permissions?.join(', ') || 'N/A'}
Business Rules: ${requirement.businessRules?.join('; ') || requirement.constraints?.join('; ') || 'N/A'}
Validations: ${requirement.validations?.join('; ') || 'N/A'}
Fields: ${JSON.stringify(requirement.fields || [])}

Requirement:
${markdown}`,
    };
}

/**
 * Unified generation prompt — REQUIREMENT-COVERAGE-FIRST.
 *
 * The PRIMARY goal is to verify every requirement (acceptance criterion, business rule, validation,
 * field rule, workflow, permission, API/UI need). Test types are NOT a quota to fill — they are the
 * complementary dimensions applied PER requirement, only where relevant. `minCount` is a floor
 * reached by deepening requirement coverage, never by padding with generic/irrelevant cases.
 *
 * One AI call covers all selected types (the orchestrator splits only for very large floors).
 */
export function buildUnifiedPrompt({
    requirement,
    markdown,
    types,
    minCount,
    coverageLabel,
}: {
    requirement: ParsedRequirement;
    markdown: string;
    types: string[];
    /** Minimum total test cases (a floor, not a per-type quota). */
    minCount: number;
    coverageLabel: string;
}): { system: string; user: string } {
    const allowedTypes = types.map((t) => `"${t}"`).join(', ');
    const complementary = types.filter((t) => t !== 'functional');
    const compList = complementary.length > 0 ? complementary.map((t) => `'${t}'`).join(', ') : '(none — functional only)';

    // Enumerate the discrete, testable requirements explicitly — this is what drives coverage.
    const reqItems: string[] = [
        ...(requirement.workflows ?? []).map((r) => `ACCEPTANCE CRITERION: ${r}`),
        ...(requirement.businessRules ?? []).map((r) => `BUSINESS RULE: ${r}`),
        ...(requirement.validations ?? []).map((r) => `VALIDATION: ${r}`),
        ...(requirement.permissions ?? []).map((r) => `PERMISSION: ${r}`),
        ...(requirement.fields ?? []).map(
            (f) => `FIELD: ${f.name}${f.rules?.length ? ` (rules: ${f.rules.join('; ')})` : ''}`,
        ),
    ];
    const reqBlock =
        reqItems.length > 0
            ? reqItems.map((r, i) => `${i + 1}. ${r}`).join('\n')
            : '(No structured requirements extracted — derive the testable requirements from the requirement text below and cover each.)';

    const system = `You are a Senior QA Architect. Your PRIMARY objective is REQUIREMENT COVERAGE: every requirement must be verified by at least one specific, traceable test case. Do NOT generate generic test cases to fill a test-type quota, and do NOT invent scenarios unrelated to the requirement.

Mandatory approach:
1. COVER EVERY REQUIREMENT: write at least one test case that directly verifies each numbered requirement below (plus any additional ones implied in the requirement text). Use the most fitting "type" — 'functional' for happy-path/positive verification, or a more specific type when the requirement is naturally about it (e.g. a permission rule → 'permission'; an API need → 'api'; a field validation → 'validation').
2. ADD COMPLEMENTARY CASES PER REQUIREMENT: for each requirement, add the cases that genuinely apply from these dimensions — ${compList}. For example, a validation rule implies a 'validation'/'negative' rejection case and a 'boundary' case; a permission rule implies a 'permission' unauthorized case. Only add a complementary case where it is truly relevant to a real requirement — never add generic edge/security cases that no requirement calls for.
3. MEET THE FLOOR: produce AT LEAST ${minCount} test cases. If covering every requirement yields fewer, DEEPEN the complementary coverage per requirement (more invalid inputs, more boundary values) — never pad with irrelevant or duplicate scenarios.
4. Every case must trace to a specific requirement and be concrete and actionable (short name, 2-4 brief numbered steps, one-line expected result). Priority is Critical|High|Medium|Low.

Coverage depth: "${coverageLabel}". Every test case "type" MUST be one of: ${allowedTypes}.

Return ONLY valid JSON (no markdown fences):
{"testCases":[{"name":"...","type":"...","priority":"...","steps":["1. ...","2. ..."],"expectedResult":"..."}],"reasoning":"one-line summary"}`;

    const user = `Module: ${requirement.module}
Feature: ${requirement.feature}
Actors: ${requirement.actors?.join(', ') || 'N/A'}

REQUIREMENTS TO COVER (write at least one test case for EACH, in order):
${reqBlock}

Full requirement:
${markdown}`;

    return { system, user };
}
