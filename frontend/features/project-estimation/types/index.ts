/**
 * Project Estimation — frontend domain types.
 * Mirrors the backend domain types (backend/src/modules/project-estimation/types). The frontend reads
 * metrics from the API; it never recomputes them (see docs/reporting-rules.md).
 */

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

export type AssignmentRole = 'QA Engineer' | 'QA Lead';

export interface ProjectVersion {
    id: string;
    projectId: string;
    name: string;
    code?: string;
    status: ProjectVersionStatus;
    targetDate?: string;
    notes: string;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
    version: number;
}

export interface EstimationModule {
    id: string;
    versionId?: string;
    projectId: string;
    name: string;
    description: string;
    sortOrder: number;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
    version: number;
}

export interface ModuleAssignment {
    id: string;
    moduleId: string;
    engineerId: string;
    engineerName: string;
    projectId: string;
    dailyCapacityHours: number;
    role: AssignmentRole;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
    version: number;
}

export interface ModuleEstimation {
    id: string;
    assignmentId?: string;
    moduleId: string;
    engineerId: string;
    engineerName: string;
    projectId: string;
    testCaseCount?: number;
    estimatedHours?: number;
    complexity?: ComplexityLevel;
    riskLevel?: RiskLevel;
    assumptions: string;
    dependencies: string[];
    notes: string;
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

export interface EstimationProjectSummary {
    projectId: string;
    totalEffortHours: number;
    estimatedDurationDays: number | null;
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

export interface EngineerWorkload {
    engineerId: string;
    engineerName: string;
    assignedHours: number;
    dailyCapacityHours: number;
    utilizationPercent: number | null;
    estimationCount: number;
}

export interface CapacityByVersion {
    versionId: string | null;
    label: string;
    assignedHours: number;
    capacityHoursPerDay: number;
    utilizationPercent: number | null;
    estimateCount: number;
}

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

export interface EstimationReviewEvent {
    id: string;
    estimationId: string;
    fromStatus?: string;
    toStatus?: string;
    action: string;
    actorId?: string;
    actorName?: string;
    comment?: string;
    createdAt: string;
}
