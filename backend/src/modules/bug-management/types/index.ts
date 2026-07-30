/**
 * Bug Management Types
 * Shared types for the bug management module
 */

// ── Enums ──────────────────────────────────────────────

export type BugLayer = 'Frontend' | 'Backend' | 'Integration' | 'Mobile' | 'Infrastructure';

export type BugSeverity = 'Critical' | 'High' | 'Medium' | 'Low';

export type BugPriority = 'P1' | 'P2' | 'P3' | 'P4';

export type BugStatus =
    | 'Open'
    | 'Assigned'
    | 'In Progress'
    | 'Fixed'
    | 'Ready For QA'
    | 'Verified'
    | 'Closed'
    | 'Reopened';

export type InputMethod = 'description' | 'structured' | 'log';

// ── Status Workflow (single source of truth) ──────────
// The backend validates every transition against this map; the frontend mirrors it to
// filter the inline Status dropdown to only valid next states. See docs/api/bugs.md.
// Reopening a non-terminal status to itself is a no-op (allowed). Any status may stay.
export const BUG_STATUS_TRANSITIONS: Record<BugStatus, BugStatus[]> = {
    Open: ['Assigned', 'In Progress', 'Closed'],
    Assigned: ['Open', 'In Progress', 'Closed'],
    'In Progress': ['Open', 'Assigned', 'Fixed', 'Closed'],
    Fixed: ['In Progress', 'Ready For QA'],
    'Ready For QA': ['Fixed', 'Verified', 'In Progress'],
    Verified: ['Closed', 'Reopened'],
    Closed: ['Reopened'],
    Reopened: ['Assigned', 'In Progress', 'Open', 'Closed'],
};

/** Valid next statuses from `current` (always includes `current` so "no change" is selectable). */
export function nextStatuses(current: BugStatus): BugStatus[] {
    return [current, ...BUG_STATUS_TRANSITIONS[current]];
}

/** True when `from → to` is a permitted workflow transition (or a no-op). */
export function isValidStatusTransition(from: BugStatus, to: BugStatus): boolean {
    return from === to || BUG_STATUS_TRANSITIONS[from].includes(to);
}

// ── Bug Entity ─────────────────────────────────────────

export interface Bug {
    id: string;
    bugId: string;
    projectId: string;
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
    reporterId?: string;
    assignee: string;
    assigneeId?: string;
    createdAt: string;
    updatedAt: string;
    version: number;
    // AI-generated metadata
    possibleRootCause?: string;
    suggestedFix?: string;
    similarBugs?: string[];
    missingInfo?: string[];
    tags?: string[];
    aiConfidence?: number;
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

// ── Update Bug Input ───────────────────────────────────

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

// ── AI Generation ──────────────────────────────────────

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

// ── Save Bug ───────────────────────────────────────────

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

// ── Analytics ──────────────────────────────────────────

export interface BugAnalytics {
    totalBugs: number;
    byLayer: Record<BugLayer, number>;
    bySeverity: Record<BugSeverity, number>;
    byStatus: Record<BugStatus, number>;
    byModule: Record<string, number>;
    byPriority: Record<BugPriority, number>;
    openBugs: number;
    criticalBugs: number;
    recentBugs: Bug[];
}

// ── Filter Options ─────────────────────────────────────

export interface BugFilter {
    projectName?: string;
    layer?: BugLayer;
    severity?: BugSeverity;
    status?: BugStatus;
    module?: string;
    search?: string;
}

// ── XLSX Import ────────────────────────────────────────

/** A single bug row parsed + normalized from the Excel sheet. */
export interface BugImportRow {
    /** Display Bug ID from the sheet — preserved when globally unique; auto-generated when blank. */
    bugId: string;
    module: string;
    title: string;
    severity: BugSeverity;
    priority: BugPriority;
    description: string;
    /** Newline-split into individual steps. */
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
    saved: Bug[];
    total: number;
}

/** Structured error categories the frontend renders differently. */
export type BugImportErrorType =
    | 'INVALID_FILE'
    | 'INVALID_COLUMNS'
    | 'EMPTY_SHEET'
    | 'DUPLICATE_BUG_ID'
    | 'BUG_ID_EXISTS'
    | 'ROW_VALIDATION'
    | 'TOO_MANY_ROWS'
    | 'PARSE_ERROR';

/** Error thrown by the import service, carrying details for a tailored UI. */
export class BugImportValidationError extends Error {
    constructor(
        public readonly errorType: BugImportErrorType,
        message: string,
        public readonly details: {
            missingColumns?: string[];
            rowErrors?: Array<{ row: number; message: string }>;
            duplicateBugIds?: string[];
            existingBugIds?: string[];
        } = {},
    ) {
        super(message);
        this.name = 'BugImportValidationError';
    }
}
