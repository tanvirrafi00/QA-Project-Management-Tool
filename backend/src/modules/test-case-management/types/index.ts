/**
 * Test Case Management Types
 * Shared types for the test case management module
 */

// ── Enums ──────────────────────────────────────────────

export type TestCasePriority = 'Critical' | 'High' | 'Medium' | 'Low';

export type TestCaseStatus =
    | 'Not Executed'
    | 'Passed'
    | 'Failed'
    | 'Blocked'
    | 'Skipped';

export type TestCaseType =
    | 'functional'
    | 'negative'
    | 'edge'
    | 'security'
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

// ── Test Case Entity ───────────────────────────────────

export interface TestCase {
    id: string;
    tcId: string;
    projectName: string;
    module: string;
    subModule?: string;
    name: string;
    description: string;
    type: TestCaseType;
    priority: TestCasePriority;
    testSteps: string[];
    expectedResult: string;
    testStatus: TestCaseStatus;
    actualResult: string;
    assignedTo: string;
    assignedToId?: string;
    executionDate: string | null;
    comments: string;
    relatedBugs: string[];
    tags: string[];
    /** Stable display order (sheet/row order on import; creation order otherwise). */
    sortOrder: number;
    /** Provenance: 'imported' for XLSX imports, 'manual' by default. */
    source: 'manual' | 'imported';
    createdAt: string;
    updatedAt: string;
    version: number;
}

// ── Save Test Case Input ───────────────────────────────

export interface SaveTestCaseInput {
    projectName: string;
    module: string;
    subModule?: string;
    name: string;
    description?: string;
    type?: TestCaseType;
    priority: TestCasePriority;
    testSteps: string[];
    expectedResult: string;
    testStatus?: TestCaseStatus;
    actualResult?: string;
    assignedTo?: string;
    executionDate?: string | null;
    comments?: string;
    relatedBugs?: string[];
    tags?: string[];
    /** Optional explicit TC ID (e.g. from an Excel import); falls back to auto-generation. */
    tcId?: string;
    /** Optional explicit display order (e.g. the sheet row index on import). */
    sortOrder?: number;
    /** Provenance: 'imported' for XLSX imports, 'manual' by default. */
    source?: 'manual' | 'imported';
}

// ── Bulk Save Input (from Generator) ───────────────────

export interface BulkSaveTestCaseInput {
    projectName: string;
    module: string;
    subModule?: string;
    testCases: Array<{
        module?: string;
        name?: string;
        type?: string;
        scenario?: string;
        steps?: string[];
        expectedResult?: string;
        priority?: string;
        tags?: string[];
        /** Optional explicit TC ID (used by XLSX import). */
        tcId?: string;
        /** Optional explicit display order (used by XLSX import). */
        sortOrder?: number;
        /** Optional provenance flag (used by XLSX import). */
        source?: 'manual' | 'imported';
    }>;
}

/** Result of a bulk-save operation with duplicate-detection metadata */
export interface BulkSaveResult {
    saved: TestCase[];
    duplicatesSkipped: number;
    total: number;
}

// ── Update Test Case Input ─────────────────────────────

export interface UpdateTestCaseInput {
    module?: string;
    subModule?: string;
    name?: string;
    description?: string;
    priority?: TestCasePriority;
    testStatus?: TestCaseStatus;
    actualResult?: string;
    assignedTo?: string;
    executionDate?: string | null;
    comments?: string;
    relatedBugs?: string[];
    tags?: string[];
    changedBy?: string;
}

export interface UpdateTestCaseResult {
    testCase: TestCase;
    changes: string[];
    version: number;
}

// ── Bulk Update Input ──────────────────────────────────

export interface BulkUpdateInput {
    ids: string[];
    testStatus?: TestCaseStatus;
    assignedTo?: string;
    changedBy?: string;
}

// ── Test Case Filter ───────────────────────────────────

export interface TestCaseFilter {
    projectName?: string;
    module?: string;
    subModule?: string;
    priority?: TestCasePriority;
    testStatus?: TestCaseStatus;
    type?: TestCaseType;
    assignedTo?: string;
    search?: string;
}

// ── Analytics ──────────────────────────────────────────

export interface TestCaseAnalytics {
    totalCases: number;
    byStatus: Record<TestCaseStatus, number>;
    byPriority: Record<TestCasePriority, number>;
    byModule: Record<string, number>;
    byType: Record<TestCaseType, number>;
    notExecuted: number;
    passed: number;
    failed: number;
    blocked: number;
    skipped: number;
    passRate: number;
    linkedBugs: number;
    modulesCovered: number;
    recentCases: TestCase[];
    moduleCoverage: Array<{ module: string; total: number; passed: number; failed: number; notExecuted: number }>;
    priorityDistribution: Array<{ priority: TestCasePriority; count: number }>;
    executionTrend: Array<{ date: string; executed: number; passed: number; failed: number }>;
    aiInsights: {
        mostUntestedModule: string;
        remainingCases: number;
        lowestPassRateModule: string;
        lowestPassRate: number;
    };
}

// ── Test Case History (Audit Trail) ────────────────────

export interface TestCaseHistoryEntry {
    id: string;
    tcId: string;
    changedField: string;
    oldValue: string;
    newValue: string;
    changedBy: string;
    changedAt: string;
}

// ── Module Tree ────────────────────────────────────────

export interface ModuleNode {
    module: string;
    subModules: Array<{ name: string; count: number }>;
    totalCount: number;
}

// ── XLSX Import ────────────────────────────────────────

/** A single test-case row parsed from an Excel sheet (sheet name = module). */
export interface ImportTestCaseRow {
    /** TC ID from the sheet — preserved on import when globally unique. */
    tcId: string;
    name: string;
    priority: TestCasePriority;
    /** Newline-split into individual steps. */
    testSteps: string[];
    expectedResult: string;
    testStatus: TestCaseStatus;
    actualResult: string;
    assignedTo: string;
    executionDate: string | null;
    relatedBugs: string[];
    comments: string;
}

/** One parsed sheet: module name (from the sheet tab) + its test-case rows. */
export interface ImportedModule {
    module: string;
    testCases: ImportTestCaseRow[];
}

/** Preview returned by the parse+validate step (no persistence). */
export interface ImportPreview {
    projectName: string;
    modules: ImportedModule[];
    modulesCount: number;
    totalCases: number;
}

/** Payload sent from the preview screen to persist the import. */
export interface ImportSaveInput {
    projectName: string;
    modules: ImportedModule[];
}

/** Result of persisting an import. */
export interface ImportSaveResult {
    saved: TestCase[];
    total: number;
    modulesCreated: number;
}

/** Structured error categories the frontend renders differently. */
export type ImportErrorType =
    | 'INVALID_FILE'
    | 'INVALID_COLUMNS'
    | 'EMPTY_SHEET'
    | 'MODULE_EXISTS'
    | 'DUPLICATE_MODULE'
    | 'ROW_VALIDATION'
    | 'PARSE_ERROR';

/** Error thrown by the import service, carrying details for a tailored UI. */
export class ImportValidationError extends Error {
    constructor(
        public readonly errorType: ImportErrorType,
        message: string,
        public readonly details: {
            conflictingModules?: string[];
            missingColumns?: string[];
            emptySheets?: string[];
            duplicateModules?: string[];
            rowErrors?: Array<{ sheet: string; row: number; message: string }>;
        } = {},
    ) {
        super(message);
        this.name = 'ImportValidationError';
    }
}
