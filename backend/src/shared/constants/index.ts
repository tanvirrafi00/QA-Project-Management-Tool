/**
 * Shared Constants
 * Centralized constants to avoid magic strings
 */

import type { GenerationProgress } from '../types';

export const PRIORITIES = {
  CRITICAL: 'Critical',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
} as const;

export const TEST_CASE_TYPES = {
  SCENARIO: 'scenario',
  FUNCTIONAL: 'functional',
  NEGATIVE: 'negative',
  EDGE: 'edge',
  SECURITY: 'security',
  BOUNDARY: 'boundary',
  UI: 'ui',
  VALIDATION: 'validation',
  API: 'api',
  PERMISSION: 'permission',
  WORKFLOW: 'workflow',
  INTEGRATION: 'integration',
  DATA_INTEGRITY: 'data_integrity',
  PERFORMANCE: 'performance',
  ACCESSIBILITY: 'accessibility',
} as const;

/**
 * Display labels for every test type (dropdowns, tabs, badges, exports). Adding a type to the enum
 * + here flows it into the UI automatically — never hardcode type lists in a route or page.
 */
export const TEST_TYPE_LABELS: Record<string, string> = {
  scenario: 'Scenario',
  functional: 'Functional',
  negative: 'Negative',
  edge: 'Edge',
  security: 'Security',
  boundary: 'Boundary',
  ui: 'UI',
  validation: 'Validation',
  api: 'API',
  permission: 'Permission',
  workflow: 'Workflow',
  integration: 'Integration',
  data_integrity: 'Data Integrity',
  performance: 'Performance',
  accessibility: 'Accessibility',
};

/**
 * The test types a user may select for generation (the spec's coverage categories). `scenario` and
 * `edge` are legacy buckets kept on the enum for existing data but not offered for new generation.
 */
export const GENERATABLE_TEST_TYPES: readonly string[] = [
  'functional',
  'ui',
  'validation',
  'boundary',
  'negative',
  'security',
  'api',
  'permission',
  'workflow',
  'integration',
  'data_integrity',
  'performance',
  'accessibility',
];

/** Dropdown options for the test-types multi-select. */
export const TEST_TYPE_OPTIONS = GENERATABLE_TEST_TYPES.map((t) => ({
  value: t,
  label: TEST_TYPE_LABELS[t] ?? t,
}));

/**
 * Canonical display order for test types — FUNCTIONAL FIRST (the functional-first coverage
 * strategy mandates Functional as the first tab), followed by the secondary dimensions in the
 * spec's strict tab order (UI, Validation, Negative, Boundary, Workflow, API, Security), then
 * the remaining generatable types, then legacy buckets last. Tabs, badges, and the type
 * distribution all sort by this so the output structure is deterministic.
 */
export const TEST_TYPE_TAB_ORDER: readonly string[] = [
  'functional',
  'ui',
  'validation',
  'negative',
  'boundary',
  'workflow',
  'api',
  'security',
  'permission',
  'integration',
  'data_integrity',
  'performance',
  'accessibility',
  'scenario',
  'edge',
];

/** Sort rank for a type (lower = earlier). Unknown types sort after all known ones, alphabetically. */
export function testTypeOrderIndex(type: string): number {
  const idx = TEST_TYPE_TAB_ORDER.indexOf(type);
  return idx === -1 ? TEST_TYPE_TAB_ORDER.length : idx;
}

/**
 * Coverage level → depth multiplier applied to the per-type target count.
 * Basic = quick smoke, Standard = default, Comprehensive = thorough, Enterprise = exhaustive.
 */
export const COVERAGE_LEVELS = {
  basic: { label: 'Basic', multiplier: 0.5 },
  standard: { label: 'Standard', multiplier: 1 },
  comprehensive: { label: 'Comprehensive', multiplier: 1.5 },
  enterprise: { label: 'Enterprise', multiplier: 2 },
} as const;

export type CoverageLevel = keyof typeof COVERAGE_LEVELS;

export const COVERAGE_LEVEL_OPTIONS = (Object.keys(COVERAGE_LEVELS) as CoverageLevel[]).map((k) => ({
  value: k,
  label: COVERAGE_LEVELS[k].label,
}));

/**
 * Modules offered in the generator dropdown. Selecting `Custom Module` reveals a free-text
 * `moduleName` input — the user, not the AI, decides the module.
 */
export const GENERATION_MODULES = [
  'Authentication',
  'Registration',
  'Login',
  'User Management',
  'Project Management',
  'Test Case Management',
  'Bug Management',
  'Dashboard',
  'Reports',
  'Custom Module',
] as const;

export const CUSTOM_MODULE = 'Custom Module';

export const TEST_STATUS = {
  NOT_EXECUTED: 'Not Executed',
  PASSED: 'Passed',
  FAILED: 'Failed',
  BLOCKED: 'Blocked',
  IN_PROGRESS: 'In Progress',
} as const;

export const DEFAULT_VALUES = {
  TEST_STATUS: 'Not Executed',
  ACTUAL_RESULT: 'N/A',
  ASSIGNED_TO: 'Unassigned',
  EXECUTION_DATE: '',
  RELATED_BUGS: 'N/A',
  COMMENTS: 'N/A',
} as const;

export const AI_MODELS = {
  GLM: 'glm-5',
  GLM_FALLBACK: 'glm-4-flash',
  GEMINI: 'gemini-2.0-flash',
} as const;

export const API_CONFIG = {
  MAX_TOKENS: 6000,
  /** Raised output budget for a single unified generation call (many cases at once). */
  GENERATION_MAX_TOKENS: 16000,
  TEMPERATURE: 0.7,
  TIMEOUT: 120000,
} as const;

export const EXCEL_COLUMNS = [
  { key: 'module', header: 'Module', width: 25 },
  { key: 'id', header: 'TC ID', width: 15 },
  { key: 'name', header: 'TC Name', width: 40 },
  { key: 'priority', header: 'Priority', width: 15 },
  { key: 'steps', header: 'Test Steps', width: 60 },
  { key: 'expectedResult', header: 'Expected Results', width: 60 },
  { key: 'testStatus', header: 'Test Status', width: 15 },
  { key: 'actualResult', header: 'Actual Result', width: 20 },
  { key: 'assignedTo', header: 'Assigned To', width: 20 },
  { key: 'executionDate', header: 'Execution Date', width: 18 },
  { key: 'relatedBugs', header: 'Related Bugs', width: 15 },
  { key: 'comments', header: 'Comments', width: 40 },
] as const;

// ===== Generation Job live progress (Phase 6) =====

/**
 * Canonical generation phase sequence for live progress. Keys match the orchestrator's
 * `timer.track()` labels AND the frontend `PHASE_KEYS`, so backend-emitted progress maps directly
 * onto the UI. Order is the functional-first phase order.
 */
export const GENERATION_PROGRESS_PHASES: { key: string; label: string }[] = [
    { key: 'requirement-processing', label: 'Analyzing Requirement' },
    { key: 'functional-generation', label: 'Building Functional Coverage' },
    { key: 'functional-expansion', label: 'Expanding Coverage' },
    { key: 'secondary-generation', label: 'Generating Secondary Types' },
    { key: 'merge', label: 'Merging & Deduplicating' },
    { key: 'final-adjustment', label: 'Final Count Adjustment' },
    { key: 'coverage', label: 'Validating Coverage' },
    { key: 'formatting', label: 'Preparing Output' },
];

/**
 * Build a `GenerationProgress` snapshot for the phase being entered (`enteringKey`), or for the
 * completed run when `done` is true. Phases before the current are 'complete', the current is
 * 'active', the rest are 'pending'. `percent` = completedPhases / total * 100 (100 when done).
 */
export function buildGenerationProgress(enteringKey: string | null, done = false): GenerationProgress {
    const phases = GENERATION_PROGRESS_PHASES;
    const enteringIdx = enteringKey ? phases.findIndex((p) => p.key === enteringKey) : -1;
    const list = phases.map((p, i) => {
        let status: 'pending' | 'active' | 'complete';
        if (done || i < enteringIdx) status = 'complete';
        else if (i === enteringIdx) status = 'active';
        else status = 'pending';
        return { key: p.key, label: p.label, status };
    });
    const completed = done ? phases.length : Math.max(0, enteringIdx);
    const percent = done ? 100 : Math.round((completed / phases.length) * 100);
    return {
        percent,
        currentPhase: enteringKey ?? phases[phases.length - 1].key,
        phases: list,
    };
}
