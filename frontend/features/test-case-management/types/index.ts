/**
 * Test Case Management Types
 * Shared types for frontend test case management features
 */

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
    | 'scenario';

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
    createdAt: string;
    updatedAt: string;
    version: number;
}

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
}

export interface BulkSaveTestCaseInput {
    projectName: string;
    module: string;
    testCases: Array<{
        module?: string;
        name?: string;
        type?: string;
        scenario?: string;
        steps?: string[];
        expectedResult?: string;
        priority?: string;
        tags?: string[];
    }>;
}

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

export interface BulkUpdateInput {
    ids: string[];
    testStatus?: TestCaseStatus;
    assignedTo?: string;
    changedBy?: string;
}

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

export interface TestCaseAnalytics {
    totalCases: number;
    byStatus: Record<string, number>;
    byPriority: Record<string, number>;
    byModule: Record<string, number>;
    byType: Record<string, number>;
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

export interface TestCaseHistoryEntry {
    id: string;
    tcId: string;
    changedField: string;
    oldValue: string;
    newValue: string;
    changedBy: string;
    changedAt: string;
}

export interface ModuleNode {
    module: string;
    subModules: Array<{ name: string; count: number }>;
    totalCount: number;
}

// ── XLSX Import ────────────────────────────────────────

/** A single test-case row parsed from an Excel sheet (sheet name = module). */
export interface ImportTestCaseRow {
    /** Original TC ID from the sheet. Preserved on save when globally unique; otherwise regenerated. */
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
    total: number;
    modulesCreated: number;
}

/** Structured error categories the UI renders differently. */
export type ImportErrorType =
    | 'INVALID_FILE'
    | 'INVALID_COLUMNS'
    | 'EMPTY_SHEET'
    | 'MODULE_EXISTS'
    | 'DUPLICATE_MODULE'
    | 'ROW_VALIDATION'
    | 'PARSE_ERROR';

/** A single row-level validation error from the backend. */
export interface ImportRowError {
    sheet: string;
    row: number;
    message: string;
}
