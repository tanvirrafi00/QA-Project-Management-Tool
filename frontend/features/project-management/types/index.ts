/**
 * Project Management Types
 * Shared frontend types for the project management module.
 * Mirrors the backend `project-management` module.
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

export const PROJECT_TYPES: ProjectType[] = [
    'Web Application',
    'Mobile Application',
    'API',
    'Microservices',
    'Other',
];

export const PROJECT_STATUSES: ProjectStatus[] = ['Active', 'Archived'];

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
    search?: string;
}

// ── Statistics ─────────────────────────────────────────

export interface ProjectStatistics {
    totalBugs: number;
    openBugs: number;
    criticalBugs: number;
    totalTestCases: number;
    generatedTestCases: number;
}

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

export interface DeleteCheckResult {
    canDelete: boolean;
    bugCount: number;
    testCaseCount: number;
    reportCount: number;
    warnings: string[];
}

// ── Update Result ──────────────────────────────────────

export interface UpdateProjectResult {
    project: Project;
    changes: string[];
    version: number;
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

// ── Project Members (Assignee dropdown) ────────────────

/** A user assigned to a project — source of the bug "Assigned To" dropdown. Mirrors backend. */
export interface ProjectMember {
    id: string;
    name: string;
    email: string;
    role: 'admin' | 'qa_lead' | 'qa_engineer';
    /** Per-project role override (defaults to the user's global role on assignment). */
    projectRole: 'admin' | 'qa_lead' | 'qa_engineer';
}
