/**
 * Bug Management Types
 * Shared types for frontend bug management features
 */

export type BugLayer = 'Frontend' | 'Backend' | 'Integration' | 'Mobile' | 'Infrastructure';
export type BugSeverity = 'Critical' | 'High' | 'Medium' | 'Low';
export type BugPriority = 'P1' | 'P2' | 'P3' | 'P4';
export type BugStatus = 'Open' | 'Assigned' | 'In Progress' | 'Fixed' | 'Ready For QA' | 'Verified' | 'Closed' | 'Reopened';
export type InputMethod = 'description' | 'structured' | 'log';

export interface AIBugReport {
    title: string;
    description: string;
    module: string;
    severity: BugSeverity;
    priority: BugPriority;
    environment: string;
    precondition: string;
    currentBehavior: string[];
    stepsToReproduce: string[];
    expectedResult: string;
    actualResult: string;
    impact: string;
    possibleRootCause: string;
    suggestedFix: string;
    similarBugs: string[];
    missingInfo: string[];
    tags: string[];
    aiConfidence: number;
}

export interface BugGenerationResult {
    bugId: string;
    projectName: string;
    layer: BugLayer;
    report: AIBugReport;
}

export interface Bug {
    id: string;
    bugId: string;
    projectName: string;
    title: string;
    description: string;
    module: string;
    layer: BugLayer;
    severity: BugSeverity;
    priority: BugPriority;
    status: BugStatus;
    environment: string;
    precondition: string;
    currentBehavior: string[];
    stepsToReproduce: string[];
    expectedResult: string;
    actualResult: string;
    impact: string;
    reporter: string;
    assignee: string;
    createdAt: string;
    updatedAt: string;
    version: number;
    possibleRootCause?: string;
    suggestedFix?: string;
    similarBugs?: string[];
    missingInfo?: string[];
    tags?: string[];
    aiConfidence?: number;
}

export interface BugAnalytics {
    totalBugs: number;
    byLayer: Record<string, number>;
    bySeverity: Record<string, number>;
    byStatus: Record<string, number>;
    byModule: Record<string, number>;
    byPriority: Record<string, number>;
    openBugs: number;
    criticalBugs: number;
    recentBugs: Bug[];
}

export interface BugGenerationInput {
    projectName: string;
    layer: BugLayer;
    inputMethod: InputMethod;
    description?: string;
    module?: string;
    expectedResult?: string;
    actualResult?: string;
    steps?: string;
    logs?: string;
}

export interface SaveBugInput {
    bugId: string;
    projectName: string;
    layer: BugLayer;
    title: string;
    description: string;
    module: string;
    severity: BugSeverity;
    priority: BugPriority;
    status?: BugStatus;
    environment?: string;
    precondition: string;
    currentBehavior?: string[];
    stepsToReproduce: string[];
    expectedResult: string;
    actualResult: string;
    impact: string;
    reporter?: string;
    assignee?: string;
    possibleRootCause?: string;
    suggestedFix?: string;
    similarBugs?: string[];
    missingInfo?: string[];
    tags?: string[];
    aiConfidence?: number;
}

// ── Bug Update (Edit) ──────────────────────────────────

export interface UpdateBugInput {
    title?: string;
    severity?: BugSeverity;
    priority?: BugPriority;
    status?: BugStatus;
    layer?: BugLayer;
    module?: string;
    assignee?: string;
    environment?: string;
    description?: string;
    impact?: string;
    precondition?: string;
    expectedResult?: string;
    actualResult?: string;
    currentBehavior?: string[];
    stepsToReproduce?: string[];
    possibleRootCause?: string;
    suggestedFix?: string;
    tags?: string[];
    changedBy?: string;
}

export interface UpdateBugResult {
    bug: Bug;
    changes: string[];
    version: number;
}

// ── Bug History (Audit Trail) ──────────────────────────

export interface BugHistoryEntry {
    id: string;
    bugId: string;
    changedField: string;
    oldValue: string;
    newValue: string;
    changedBy: string;
    changedAt: string;
}

// ── XLSX Import ────────────────────────────────────────

/** A single bug row parsed + normalized from the Excel sheet. */
export interface BugImportRow {
    bugId: string;
    module: string;
    title: string;
    severity: BugSeverity;
    priority: BugPriority;
    description: string;
    stepsToReproduce: string[];
    expectedResult: string;
    actualResult: string;
    impact: string;
    status: BugStatus;
    assignee: string;
}

/** Preview returned by the parse+validate step (no persistence). */
export interface BugImportPreview {
    projectName: string;
    bugs: BugImportRow[];
    totalBugs: number;
}

/** Payload sent from the preview screen to persist the import. */
export interface BugImportSaveInput {
    projectName: string;
    bugs: BugImportRow[];
}

/** Result of persisting an import. */
export interface BugImportSaveResult {
    total: number;
}

/** Structured error categories the import page renders differently. */
export type BugImportErrorType =
    | 'INVALID_FILE'
    | 'INVALID_COLUMNS'
    | 'EMPTY_SHEET'
    | 'DUPLICATE_BUG_ID'
    | 'BUG_ID_EXISTS'
    | 'ROW_VALIDATION'
    | 'TOO_MANY_ROWS'
    | 'PARSE_ERROR';

/** A single row-level validation error (1-based sheet row, incl. header). */
export interface BugImportRowError {
    row: number;
    message: string;
}
