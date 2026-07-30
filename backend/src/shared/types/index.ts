/**
 * Shared Type Definitions
 * Centralized types used across the application
 */

// ===== Test Case Types =====

export interface TestCaseInput {
    projectName?: string;
    module?: string;
    subModule?: string;
    moduleName?: string;
    featureName?: string;
    userStory: string;
    acceptanceCriteria?: string;
    businessRules?: string;
    /** Minimum total test cases to generate (user steering control). */
    minTestCases?: number;
    /** Coverage depth — maps to a per-type multiplier (see COVERAGE_LEVELS in shared/constants). */
    coverageLevel?: 'basic' | 'standard' | 'comprehensive' | 'enterprise';
    /** Selected test types to generate (subset of GENERATABLE_TEST_TYPES). */
    testTypes?: string[];
}

export interface AgentTestCase {
    id: string;
    module: string;
    name: string;
    type: TestCaseType;
    priority: Priority;
    steps: string[];
    expectedResult: string;
    tags: string[];
    testStatus: string;
    actualResult: string;
    assignedTo: string;
    executionDate: string;
    relatedBugs: string;
    comments: string;
    scenario?: string;
}

/** A single phase of the functional-first coverage strategy (for the strategy dashboard). */
export interface StrategyPhase {
    /** Phase number (1-6) per the functional-first strategy. */
    phase: number;
    name: string;
    /** 'complete' | 'skipped' | 'expanded' */
    status: string;
    detail: string;
}

/** Requirement → functional test-case coverage (the Phase 3 validation gate result). */
export interface FunctionalCoverage {
    /** Total discrete functional requirements enumerated from the requirement. */
    total: number;
    /** Requirements mapped to ≥1 functional test case. */
    covered: number;
    /** Requirement labels with no functional test case (gaps). */
    uncovered: string[];
}

/**
 * Functional-first strategy metadata. Proves the strategy was followed: functional coverage came
 * first and is complete before secondary types were generated. Surfaced in the response so the UI
 * can show the phase progression and the functional-coverage gate result.
 */
export interface FunctionalFirstStrategy {
    approach: 'functional-first';
    /** True when every enumerated functional requirement mapped to ≥1 functional test case. */
    functionalComplete: boolean;
    functionalCount: number;
    secondaryCount: number;
    functionalCoverage: FunctionalCoverage;
    phases: StrategyPhase[];
}

/**
 * Aggregated generation timings (Phase 1 performance instrumentation). Additive — formalized into
 * the response `meta` envelope in Phase 2. Mirrored on the frontend.
 */
export interface GenerationTimings {
    /** Total wall-clock time for the generation (request enter → response built). */
    totalMs: number;
    /** True when the result was served from the result cache (0 AI calls). */
    cacheHit: boolean;
    /** Per-phase durations (label → ms). Excludes the granular per-AI-call entries. */
    phases: Record<string, number>;
    /** Number of AI provider calls made during this generation. */
    aiCalls: number;
    /** Aggregate wall-clock time spent inside AI provider calls. */
    aiTotalMs: number;
}

export interface TestGenerationResponse {
    feature: string;
    module: string;
    summary: TestSummary;
    testCases: TestCasesByCategory;
    coverage: CoverageResult;
    requirementGaps: string[];
    apiTests?: ApiTestCase[];
    /** Auto-save metadata — populated when generated cases are persisted to the repository */
    repository?: RepositorySaveResult;
    /** Functional-first strategy metadata (phases + functional-coverage gate). */
    strategy?: FunctionalFirstStrategy;
    /** Phase 1 performance instrumentation (additive; surfaced in `meta` in Phase 2). */
    timings?: GenerationTimings;
}

export interface RepositorySaveResult {
    savedToRepository: boolean;
    savedCount: number;
    duplicatesSkipped: number;
    projectName: string;
    module: string;
    subModule?: string;
}

export interface TestSummary {
    totalCases: number;
    byType: Record<string, number>;
    byPriority: Record<string, number>;
    /** Per-type counts for the coverage dashboard + result tabs (single source). Populated in Phase 3. */
    typeDistribution?: Record<string, number>;
}

/**
 * Generated test cases grouped by type. Dynamic keys (one per type that produced cases) so the
 * full type taxonomy — including future types — is represented without changing this shape.
 * Legacy readers using `.scenarios` / `.positive` etc. still work via index access.
 */
export type TestCasesByCategory = Record<string, AgentTestCase[]>;

export interface CoverageResult {
    score: number;
    covered: string[];
    missing: string[];
    risks: string[];
    recommendations?: string[];
}

export interface ApiTestCase {
    id: string;
    endpoint: string;
    method: string;
    testType: string;
    description: string;
    request: any;
    expectedResponse: any;
    assertions: string[];
}

// ===== Requirement Types =====

export interface ParsedRequirement {
    module: string;
    feature: string;
    actors: string[];
    permissions: string[];
    fields: FieldInfo[];
    constraints: string[];
    validations: string[];
    businessRules: string[];
    dependencies: string[];
    missingInfo: string[];
    workflows: string[];
}

export interface FieldInfo {
    name: string;
    type: string;
    rules: string[];
    validations: string[];
}

export interface ProcessedRequirement {
    module: string;
    feature: string;
    userStory: string;
    acceptanceCriteria: string[];
    businessRules: string[];
    permissions: string[];
    validations: string[];
    dependencies: string[];
    notifications: string[];
    auditLogs: string[];
    apiRequirements: string[];
    uiRequirements: string[];
    actors: string[];
    fields: FieldInfo[];
    missingInfo: string[];
    assumptions: string[];
    contradictions: string[];
    scores: RequirementScore;
    markdown: string;
    originalLength: number;
    cleanedLength: number;
    wasChunked: boolean;
}

export interface RequirementScore {
    completeness: number;
    clarity: number;
    qaReadiness: number;
}

// ===== AI Types =====

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface GenerationResult {
    content: string;
    provider: string;
    model: string;
}

export interface AgentOutput {
    agent: string;
    testCases: AgentTestCase[];
    reasoning: string;
}

export interface MergedTestCases {
    deduplicated: AgentTestCase[];
    duplicatesRemoved: number;
    byCategory: Record<string, AgentTestCase[]>;
}

// ===== Enum-like Types =====

export type Priority = 'Critical' | 'High' | 'Medium' | 'Low';
export type TestCaseType =
    | 'functional'
    | 'negative'
    | 'security'
    | 'edge'
    | 'boundary'
    | 'scenario'
    | 'ui'
    | 'validation'
    | 'api'
    | 'permission'
    | 'workflow'
    | 'integration'
    | 'data_integrity'
    | 'performance'
    | 'accessibility';
export type AgentType = 'functional' | 'negative' | 'security' | 'edge';

// ===== Generation Job (Phase 6 — job-based processing) =====

/** A generation job's lifecycle state. */
export type GenerationJobStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

/** One phase in the live progress display. */
export interface GenerationProgressPhase {
    /** Backend phase key (matches PerformanceTimer labels + the FE PHASE_KEYS). */
    key: string;
    /** User-facing label. */
    label: string;
    status: 'pending' | 'active' | 'complete';
}

/** Live progress, emitted by the orchestrator at each phase boundary. */
export interface GenerationProgress {
    /** 0..100 — discrete, advanced as each phase completes. */
    percent: number;
    /** Key of the phase currently running (or last completed). */
    currentPhase: string;
    /** Full canonical phase list with per-phase status. */
    phases: GenerationProgressPhase[];
}

/** Persisted job record (in-memory today; Redis in Phase 8). */
export interface GenerationJob {
    id: string;
    status: GenerationJobStatus;
    /** Snapshot of the validated input (for debugging / future retry). */
    input: TestCaseInput;
    progress: GenerationProgress;
    /** Full generation result — present when status === 'COMPLETED'. */
    result?: TestGenerationResponse;
    /** Failure message — present when status === 'FAILED'. */
    error?: string;
    startedAt: number;
    completedAt?: number;
    /** Set by cancelJob; the orchestrator checks it between phases and stops. */
    cancelRequested: boolean;
    version: number;
}

/** What the polling endpoint returns (job minus the input snapshot). */
export interface GenerationJobSnapshot {
    id: string;
    status: GenerationJobStatus;
    progress: GenerationProgress;
    result?: TestGenerationResponse;
    error?: string;
    startedAt: number;
    completedAt?: number;
}

/** Options passed to the orchestrator for live progress + cancellation (Phase 6). */
export interface OrchestratorOptions {
    /** Invoked at each phase boundary with the latest progress. */
    onProgress?: (progress: GenerationProgress) => void;
    /** Cancel signal — the orchestrator checks `cancelled` between phases and aborts if set. */
    signal?: { cancelled: boolean };
}
