/**
 * Project Management Types
 * Shared types for the project management module.
 * Projects are the central hub — bugs, test cases and reports all belong to a project.
 */

// ── Enums ──────────────────────────────────────────────

export type ProjectStatus = 'Active' | 'Archived';

export type ProjectType =
    | 'Web Application'
    | 'Mobile Application'
    | 'API'
    | 'Microservices'
    | 'Other';

// ── Project Entity ─────────────────────────────────────

export interface Project {
    id: string;
    projectCode: string;      // Unique, uppercase, e.g. "LOGE" → used in LOGE-BUG-001
    projectName: string;      // Unique, human readable, e.g. "LOGE Admin"
    description: string;
    projectType: ProjectType;
    status: ProjectStatus;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
    version: number;
}

// ── Create / Update Inputs ─────────────────────────────

export interface CreateProjectInput {
    projectName: string;
    projectCode: string;
    description?: string;
    projectType: ProjectType;
    status?: ProjectStatus;
    createdBy?: string;
}

export interface UpdateProjectInput {
    projectName?: string;
    description?: string;
    projectType?: ProjectType;
    status?: ProjectStatus;
    changedBy?: string;
}

// ── Filter ─────────────────────────────────────────────

export interface ProjectFilter {
    status?: ProjectStatus;
    projectType?: ProjectType;
    search?: string;          // matches projectName OR projectCode
}

// ── Statistics ─────────────────────────────────────────

/**
 * Per-project statistics, computed live from the bug & test-case repositories.
 */
export interface ProjectStatistics {
    totalBugs: number;
    openBugs: number;
    criticalBugs: number;
    totalTestCases: number;
    generatedTestCases: number;
}

/**
 * A project enriched with its live statistics — used by the details page
 * and the list table (Bugs / Test Cases columns).
 */
export interface ProjectWithStats extends Project {
    statistics: ProjectStatistics;
}

// ── Summary (dashboard cards) ──────────────────────────

export interface ProjectSummary {
    totalProjects: number;
    activeProjects: number;
    archivedProjects: number;
    totalBugs: number;
    totalTestCases: number;
}

// ── Delete Guard ───────────────────────────────────────

/**
 * Result of a delete-safety check. A project can only be hard-deleted when it
 * has no associated data; otherwise the caller should archive instead.
 */
export interface DeleteCheckResult {
    canDelete: boolean;
    bugCount: number;
    testCaseCount: number;
    reportCount: number;      // reserved for future reports module
    warnings: string[];
}

// ── History (Audit Trail) ──────────────────────────────

export interface ProjectHistoryEntry {
    id: string;
    projectId: string;
    changedField: string;
    oldValue: string;
    newValue: string;
    changedBy: string;
    changedAt: string;
}
