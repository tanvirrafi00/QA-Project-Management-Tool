/**
 * Project Estimation Types
 * Domain types for module-level QA effort estimation.
 *
 * Hierarchy: Project → Version/Release → Module → Engineer → Estimation.
 * Every entity carries the standard audit fields (createdAt/updatedAt/version, soft-delete via archive).
 * Domain enum values are the display strings the UI uses; the SQL repository maps them to lowercase
 * DB labels (see `estimation.repository.sql.ts`).
 */

// ── Enums (display strings) ───────────────────────────

export type ProjectVersionStatus = 'Draft' | 'Active' | 'Locked';

export type EstimationStatus =
    | 'Draft'
    | 'Submitted'
    | 'Under Review'
    | 'Approved'
    | 'Revision Requested'
    | 'Rejected';

export type ComplexityLevel = 'Low' | 'Medium' | 'High' | 'Critical';

export type RiskLevel = 'Low' | 'Medium' | 'High';

/** Assignment role (subset of UserRole — an engineer or a lead assigned to a module). */
export type AssignmentRole = 'QA Engineer' | 'QA Lead';

// ── Version / Release ─────────────────────────────────

export interface ProjectVersion {
    id: string;
    projectId: string;
    name: string;
    code?: string;
    status: ProjectVersionStatus;
    targetDate?: string;       // ISO date (yyyy-mm-dd)
    notes: string;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
    version: number;
}

// ── Module (the QA module being estimated) ────────────

export interface EstimationModule {
    id: string;
    versionId?: string;        // optional → "Unversioned"
    projectId: string;
    name: string;
    description: string;
    sortOrder: number;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
    version: number;
}

// ── Assignment (Module → Engineer + capacity) ─────────

export interface ModuleAssignment {
    id: string;
    moduleId: string;
    engineerId: string;        // user uuid when RBAC is on; a stable client id otherwise
    engineerName: string;      // denormalized display name (auth-off usability)
    projectId: string;
    dailyCapacityHours: number;
    role: AssignmentRole;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
    version: number;
}

// ── Estimation (an engineer's estimate of a module) ───

export interface ModuleEstimation {
    id: string;
    assignmentId?: string;
    moduleId: string;
    engineerId: string;
    engineerName: string;
    projectId: string;
    // Estimate
    testCaseCount?: number;
    estimatedHours?: number;
    complexity?: ComplexityLevel;
    riskLevel?: RiskLevel;
    assumptions: string;
    dependencies: string[];
    notes: string;
    // Workflow
    status: EstimationStatus;
    reviewerId?: string;
    reviewComment?: string;
    reviewedAt?: string;
    isFinalApproved: boolean;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
    version: number;
}

// ── Review events (append-only) & history ─────────────

export interface EstimationReviewEvent {
    id: string;
    estimationId: string;
    fromStatus?: string;
    toStatus?: string;
    action: string;            // submit | approve | reject | request_revision | resubmit | reset | reopen
    actorId?: string;
    actorName?: string;
    comment?: string;
    createdAt: string;
}

export interface EstimationHistoryEntry {
    id: string;
    estimationId: string;
    changedField: string;
    oldValue: string;
    newValue: string;
    changedBy: string;
    changedAt: string;
}

// ── Create / Update Inputs ────────────────────────────

export interface CreateVersionInput {
    projectId: string;
    name: string;
    code?: string;
    status?: ProjectVersionStatus;
    targetDate?: string;
    notes?: string;
    createdBy?: string;
}

export interface CreateModuleInput {
    projectId: string;
    versionId?: string;
    name: string;
    description?: string;
    sortOrder?: number;
    createdBy?: string;
}

export interface CreateAssignmentInput {
    moduleId: string;
    engineerId: string;
    engineerName?: string;
    projectId?: string;        // resolved from the module when omitted
    dailyCapacityHours?: number;
    role?: AssignmentRole;
    createdBy?: string;
}

export interface CreateEstimationInput {
    assignmentId?: string;
    moduleId: string;
    engineerId: string;
    engineerName?: string;
    projectId?: string;        // resolved from the module when omitted
    testCaseCount?: number;
    estimatedHours?: number;
    complexity?: ComplexityLevel;
    riskLevel?: RiskLevel;
    assumptions?: string;
    dependencies?: string[];
    notes?: string;
    createdBy?: string;
}

export interface UpdateEstimationInput {
    testCaseCount?: number;
    estimatedHours?: number;
    complexity?: ComplexityLevel;
    riskLevel?: RiskLevel;
    assumptions?: string;
    dependencies?: string[];
    notes?: string;
    changedBy?: string;
}

// ── Filters ───────────────────────────────────────────

export interface EstimationFilter {
    projectId?: string;
    versionId?: string;
    moduleId?: string;
    engineerId?: string;
    status?: EstimationStatus;
    isFinalApproved?: boolean;
    search?: string;           // matches module name / engineer name / assumptions
}

export interface VersionFilter {
    projectId?: string;
    status?: ProjectVersionStatus;
    search?: string;
}

export interface ModuleFilter {
    projectId?: string;
    versionId?: string;
    search?: string;
}

export interface AssignmentFilter {
    moduleId?: string;
    engineerId?: string;
    projectId?: string;
}

// ── Computed summary (server-side, via estimation-math) ─

/**
 * Project-level estimation summary. All metrics computed in `estimation-math.ts`.
 * `null` durations/utilizations mean "cannot compute" (zero capacity) → UI shows "N/A".
 */
export interface EstimationProjectSummary {
    projectId: string;
    /** Sum of final-approved estimate hours. */
    totalEffortHours: number;
    /** Effort ÷ team capacity per day (null when team capacity is 0). */
    estimatedDurationDays: number | null;
    /** Sum of each distinct engineer's max assignment capacity (hours/day). */
    teamCapacityHoursPerDay: number;
    moduleCount: number;
    approvedModuleCount: number;
    totalEstimations: number;
    approvedEstimations: number;
    finalApprovedEffortHours: number;
    engineerCount: number;
    complexityScore: number;
    riskScore: number;
}

/** Per-engineer workload row (Engineer Breakdown + capacity views). */
export interface EngineerWorkload {
    engineerId: string;
    engineerName: string;
    assignedHours: number;
    dailyCapacityHours: number;
    /** Assigned hours ÷ available-hours-for-period × 100 (null when available is 0). */
    utilizationPercent: number | null;
    estimationCount: number;
}

/** Capacity breakdown for one version (drives the utilization-trend line chart). */
export interface CapacityByVersion {
    versionId: string | null;
    label: string;
    assignedHours: number;
    capacityHoursPerDay: number;
    utilizationPercent: number | null;
    estimateCount: number;
}

/**
 * Capacity-planning report (all metrics computed server-side via estimation-math). Drives the
 * Capacity tab charts: workload distribution (bar), team utilization (gauge), trend (line).
 */
export interface CapacityReport {
    projectId: string;
    teamCapacityHoursPerDay: number;
    totalAssignedHours: number;
    availableHours: number;
    durationDays: number | null;
    overallUtilizationPercent: number | null;
    engineerCount: number;
    engineers: EngineerWorkload[];
    byVersion: CapacityByVersion[];
}
