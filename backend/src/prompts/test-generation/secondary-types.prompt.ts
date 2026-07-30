/**
 * Secondary Test-Types Prompt (complementary dimensions).
 *
 * Generated ONLY AFTER functional coverage is complete (Phase 5 of the functional-first strategy).
 * Produces the complementary test dimensions — UI, Validation, Negative, Boundary, Workflow, API,
 * Security — each tracing to a real requirement. Functional is intentionally excluded here because
 * it was already fully covered in the dedicated functional-first pass.
 */

import { TEST_TYPE_LABELS } from '../../shared/constants';
import { TEST_CASE_FORMAT } from './format.prompt';
import type { ParsedRequirement } from '../../shared/types';

/** Per-type focus guidance for the secondary dimensions (mirrors the unified prompt's guidance). */
const SECONDARY_GUIDANCE: Record<string, string> = {
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

export interface SecondaryTypesPromptInput {
    requirement: ParsedRequirement;
    /** Normalized requirement markdown (full context for the model). */
    markdown: string;
    /** The EXACT module name the user typed — used verbatim in every test-case name. */
    module: string;
    /** Secondary types to generate (functional excluded — already covered). */
    types: string[];
    /** Minimum total secondary test cases to produce (the complementary floor). */
    targetCount: number;
    /** Coverage depth label (steers how deep to go). */
    coverageLabel: string;
}

/**
 * Build the secondary-types system + user prompts. Each selected secondary type gets focused
 * guidance; the model is told functional is already complete so it must not duplicate it.
 */
export function buildSecondaryTypesPrompt({
    requirement,
    markdown,
    module,
    types,
    targetCount,
    coverageLabel,
}: SecondaryTypesPromptInput): { system: string; user: string } {
    const allowedTypes = types.map((t) => `"${t}"`).join(', ');
    const typeGuidance = types
        .map((t) => `- "${t}" (${TEST_TYPE_LABELS[t] ?? t}): ${SECONDARY_GUIDANCE[t] ?? 'Generate thorough, distinct test cases for this category.'}`)
        .join('\n');

    // Enumerate the discrete requirements so complementary cases stay anchored to real needs.
    const reqItems: string[] = [
        ...(requirement.workflows ?? []).map((r) => `WORKFLOW: ${r}`),
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
            : '(No structured requirements extracted — derive the testable requirements from the requirement text below and add the complementary cases each genuinely needs.)';

    const system = `You are a Senior QA Architect. FUNCTIONAL COVERAGE IS ALREADY COMPLETE — do NOT generate functional test cases. Your job now is to add COMPLEMENTARY test cases for the secondary dimensions below, each tracing to a real requirement.

Secondary types to generate (each "type" MUST be one of: ${allowedTypes}):
${typeGuidance}

Rules:
1. NO FUNCTIONAL CASES: never set "type" to "functional". Functional was covered in a prior pass.
2. RELEVANCE: only add a complementary case where it genuinely applies to a real requirement — never add generic edge/security cases that no requirement calls for.
3. NAMING RULE (STRICT): every "name" must be detailed, business-context-aware, and module-consistent (reference "${module}"). NEVER generic.
   GOOD: "Verify the system rejects an email longer than 254 characters in ${module}"
   BAD: "Test email length"
4. Each case: 2-4 brief numbered steps, one concrete expected result, priority Critical|High|Medium|Low.
5. MEET THE FLOOR: produce AT LEAST ${targetCount} complementary test cases across the listed types. Distribute them sensibly across the types that the requirement actually calls for.
6. No two cases may verify the same behavior.

Coverage depth: "${coverageLabel}".

${TEST_CASE_FORMAT}

Return ONLY valid JSON (no markdown fences):
{"testCases":[{"name":"Verify that ... in ${module}","type":"validation","priority":"...","steps":["1. ...","2. ..."],"expectedResult":"..."}],"reasoning":"one-line summary of complementary coverage"}`;

    const user = `Module (use EXACTLY this name in every test case): ${module}
Feature: ${requirement.feature}
Actors: ${requirement.actors?.join(', ') || 'N/A'}

REQUIREMENTS (add the complementary cases each genuinely needs):
${reqBlock}

Full requirement:
${markdown}`;

    return { system, user };
}
