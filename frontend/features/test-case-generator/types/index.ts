/**
 * Type definitions for Test Case Generator feature
 * Centralized type management for better type safety and reusability
 */

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
  /** Coverage depth — maps to a per-type multiplier. */
  coverageLevel?: 'basic' | 'standard' | 'comprehensive' | 'enterprise';
  /** Selected test types to generate. */
  testTypes?: string[];
}

export interface TestCase {
  id: string;
  module?: string;
  name?: string;
  type: string;
  scenario: string;
  steps: string[];
  expectedResult: string;
  priority: string;
  tags: string[];
  testStatus?: string;
  actualResult?: string;
  assignedTo?: string;
  executionDate?: string;
  relatedBugs?: string;
  comments?: string;
}

export interface TestSummary {
  totalCases: number;
  byType: Record<string, number>;
  byPriority: Record<string, number>;
  /** Per-type counts for the coverage dashboard + result tabs (single source). */
  typeDistribution?: Record<string, number>;
}

export interface TestCoverage {
  score: number;
  covered: string[];
  missing: string[];
  risks: string[];
  recommendations?: string[];
}

/** A single phase of the functional-first coverage strategy (for the strategy dashboard). */
export interface StrategyPhase {
  phase: number;
  name: string;
  /** 'complete' | 'skipped' | 'expanded' | 'partial' */
  status: string;
  detail: string;
}

/** Requirement → functional test-case coverage (the Phase 3 validation gate result). */
export interface FunctionalCoverage {
  total: number;
  covered: number;
  uncovered: string[];
}

/** Functional-first strategy metadata (mirrors the backend FunctionalFirstStrategy). */
export interface FunctionalFirstStrategy {
  approach: 'functional-first';
  functionalComplete: boolean;
  functionalCount: number;
  secondaryCount: number;
  functionalCoverage: FunctionalCoverage;
  phases: StrategyPhase[];
}

/**
 * Generated test cases grouped by type. Dynamic keys (one per type that produced cases) so the full
 * type taxonomy is represented. Mirrors the backend `TestCasesByCategory` Record.
 */
export type TestCasesByType = Record<string, TestCase[]>;

export interface RepositorySaveResult {
  savedToRepository: boolean;
  savedCount: number;
  duplicatesSkipped: number;
  projectName: string;
  module: string;
  subModule?: string;
}

/** Backend performance timings (Phase 1 instrumentation). Mirrors backend `GenerationTimings`. */
export interface GenerationTimings {
  totalMs: number;
  cacheHit: boolean;
  phases: Record<string, number>;
  aiCalls: number;
  aiTotalMs: number;
}

export interface TestGenerationResponse {
  feature: string;
  module?: string;
  summary: TestSummary;
  testCases: TestCasesByType;
  coverage: TestCoverage;
  requirementGaps: string[];
  apiTests?: unknown[];
  /** Auto-save metadata — populated when generated cases are persisted to the repository */
  repository?: RepositorySaveResult;
  /** Functional-first strategy metadata (phases + functional-coverage gate). */
  strategy?: FunctionalFirstStrategy;
  /** Backend performance timings (Phase 1 instrumentation; absent on older cached results). */
  timings?: GenerationTimings;
}

// ===== Generation Job (Phase 6 — job-based processing). Mirrors backend types. =====

export type GenerationJobStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface GenerationProgressPhase {
  key: string;
  label: string;
  status: 'pending' | 'active' | 'complete';
}

export interface GenerationProgress {
  percent: number;
  currentPhase: string;
  phases: GenerationProgressPhase[];
}

/** What the polling endpoint returns (status + progress; result when COMPLETED, error when FAILED). */
export interface GenerationJobSnapshot {
  id: string;
  status: GenerationJobStatus;
  progress: GenerationProgress;
  result?: TestGenerationResponse;
  error?: string;
  startedAt: number;
  completedAt?: number;
}

/** Tab id: 'summary' | 'all' | any test-type key (dynamic, driven by typeDistribution). */
export type TabId = string;

export interface Tab {
  id: TabId;
  label: string;
  count: number;
}

export interface GenerationResult {
  success: boolean;
  data?: TestGenerationResponse;
  error?: string;
}

export type FormState = TestCaseInput;

// ===== Result UI Types =====

export type ViewMode = 'card' | 'table';

export type SortField = 'id' | 'name' | 'priority' | 'type' | 'module';
export type SortDirection = 'asc' | 'desc';

export interface SortConfig {
  field: SortField;
  direction: SortDirection;
}

export interface FilterState {
  search: string;
  priorities: Set<string>;
  types: Set<string>;
  modules: Set<string>;
}

export interface PaginationState {
  page: number;
  pageSize: number;
}

export interface AIInsight {
  riskAreas: string[];
  missingRequirements: string[];
  suggestedTests: string[];
}
