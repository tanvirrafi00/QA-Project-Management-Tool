/**
 * Project Estimation — client service.
 *
 * Calls the backend via the catch-all Route Handler proxy (app/api/[...path]/route.ts), so every path
 * is same-origin relative and the httpOnly session cookie is attached server-side. Returns
 * `ActionResponse<T>` ({ success, data, error }) like the other feature services.
 *
 * Endpoints live under /api/estimations (mounted in backend/src/index.ts).
 */

import { apiClient, type ActionResponse } from '@/lib/api-client';
import type {
    ProjectVersion,
    EstimationModule,
    ModuleAssignment,
    ModuleEstimation,
    EstimationProjectSummary,
    EngineerWorkload,
    CapacityReport,
    EstimationReviewEvent,
    ComplexityLevel,
    RiskLevel,
    EstimationStatus,
} from '../types';

const BASE = '/api/estimations';

export interface CreateVersionPayload {
    name: string;
    code?: string;
    status?: 'Draft' | 'Active' | 'Locked';
    targetDate?: string;
    notes?: string;
}

export interface CreateModulePayload {
    name: string;
    description?: string;
    versionId?: string;
    sortOrder?: number;
}

export interface CreateAssignmentPayload {
    engineerId: string;
    engineerName?: string;
    dailyCapacityHours?: number;
    role?: 'QA Engineer' | 'QA Lead';
}

export interface CreateEstimationPayload {
    engineerId: string;
    engineerName?: string;
    testCaseCount?: number;
    estimatedHours?: number;
    complexity?: ComplexityLevel;
    riskLevel?: RiskLevel;
    assumptions?: string;
    dependencies?: string[];
    notes?: string;
}

export interface UpdateEstimationPayload {
    testCaseCount?: number;
    estimatedHours?: number;
    complexity?: ComplexityLevel;
    riskLevel?: RiskLevel;
    assumptions?: string;
    dependencies?: string[];
    notes?: string;
}

export interface EstimationListFilter {
    moduleId?: string;
    engineerId?: string;
    status?: EstimationStatus;
    isFinalApproved?: boolean;
    search?: string;
}

function unwrap<T>(e: { success: boolean; data?: T; error?: string }): ActionResponse<T> {
    return { success: e.success, data: e.data, error: e.error };
}

export const estimationService = {
    // ── Summary & workload ─────────────────────────────
    async getSummary(projectId: string): Promise<ActionResponse<EstimationProjectSummary>> {
        return unwrap(await apiClient.get<EstimationProjectSummary>(`${BASE}/projects/${encodeURIComponent(projectId)}/summary`));
    },

    async getEngineerWorkloads(projectId: string): Promise<ActionResponse<EngineerWorkload[]>> {
        return unwrap(await apiClient.get<EngineerWorkload[]>(`${BASE}/projects/${encodeURIComponent(projectId)}/engineers`));
    },

    async getCapacity(projectId: string): Promise<ActionResponse<CapacityReport>> {
        return unwrap(await apiClient.get<CapacityReport>(`${BASE}/projects/${encodeURIComponent(projectId)}/capacity`));
    },

    // ── Versions ───────────────────────────────────────
    async listVersions(projectId: string): Promise<ActionResponse<ProjectVersion[]>> {
        return unwrap(await apiClient.get<ProjectVersion[]>(`${BASE}/projects/${encodeURIComponent(projectId)}/versions`));
    },

    async createVersion(projectId: string, payload: CreateVersionPayload): Promise<ActionResponse<ProjectVersion>> {
        return unwrap(await apiClient.post<ProjectVersion>(`${BASE}/projects/${encodeURIComponent(projectId)}/versions`, payload));
    },

    // ── Modules ────────────────────────────────────────
    async listModules(projectId: string, versionId?: string): Promise<ActionResponse<EstimationModule[]>> {
        const q = versionId ? `?versionId=${encodeURIComponent(versionId)}` : '';
        return unwrap(await apiClient.get<EstimationModule[]>(`${BASE}/projects/${encodeURIComponent(projectId)}/modules${q}`));
    },

    async createModule(projectId: string, payload: CreateModulePayload): Promise<ActionResponse<EstimationModule>> {
        return unwrap(await apiClient.post<EstimationModule>(`${BASE}/projects/${encodeURIComponent(projectId)}/modules`, payload));
    },

    // ── Assignments ────────────────────────────────────
    async listAssignments(moduleId: string): Promise<ActionResponse<ModuleAssignment[]>> {
        return unwrap(await apiClient.get<ModuleAssignment[]>(`${BASE}/modules/${encodeURIComponent(moduleId)}/assignments`));
    },

    async createAssignment(moduleId: string, payload: CreateAssignmentPayload): Promise<ActionResponse<ModuleAssignment>> {
        return unwrap(await apiClient.post<ModuleAssignment>(`${BASE}/modules/${encodeURIComponent(moduleId)}/assignments`, payload));
    },

    // ── Estimations ────────────────────────────────────
    async listEstimations(projectId: string, filter?: EstimationListFilter): Promise<ActionResponse<ModuleEstimation[]>> {
        const query = new URLSearchParams();
        if (filter?.moduleId) query.set('moduleId', filter.moduleId);
        if (filter?.engineerId) query.set('engineerId', filter.engineerId);
        if (filter?.status) query.set('status', filter.status);
        if (filter?.isFinalApproved !== undefined) query.set('isFinalApproved', String(filter.isFinalApproved));
        if (filter?.search) query.set('search', filter.search);
        const qs = query.toString() ? `?${query.toString()}` : '';
        return unwrap(await apiClient.get<ModuleEstimation[]>(`${BASE}/projects/${encodeURIComponent(projectId)}/estimations${qs}`));
    },

    async getEstimation(id: string): Promise<ActionResponse<ModuleEstimation>> {
        return unwrap(await apiClient.get<ModuleEstimation>(`${BASE}/estimations/${encodeURIComponent(id)}`));
    },

    async createEstimation(moduleId: string, payload: CreateEstimationPayload): Promise<ActionResponse<ModuleEstimation>> {
        return unwrap(await apiClient.post<ModuleEstimation>(`${BASE}/modules/${encodeURIComponent(moduleId)}/estimations`, payload));
    },

    async updateEstimation(id: string, payload: UpdateEstimationPayload): Promise<ActionResponse<ModuleEstimation>> {
        return unwrap(await apiClient.patch<ModuleEstimation>(`${BASE}/estimations/${encodeURIComponent(id)}`, payload));
    },

    // ── Approval workflow ──────────────────────────────
    async submit(id: string): Promise<ActionResponse<ModuleEstimation>> {
        return unwrap(await apiClient.post<ModuleEstimation>(`${BASE}/estimations/${encodeURIComponent(id)}/submit`));
    },
    async resubmit(id: string): Promise<ActionResponse<ModuleEstimation>> {
        return unwrap(await apiClient.post<ModuleEstimation>(`${BASE}/estimations/${encodeURIComponent(id)}/resubmit`));
    },
    async approve(id: string, comment?: string): Promise<ActionResponse<ModuleEstimation>> {
        return unwrap(await apiClient.post<ModuleEstimation>(`${BASE}/estimations/${encodeURIComponent(id)}/approve`, { comment }));
    },
    async requestRevision(id: string, comment?: string): Promise<ActionResponse<ModuleEstimation>> {
        return unwrap(await apiClient.post<ModuleEstimation>(`${BASE}/estimations/${encodeURIComponent(id)}/request-revision`, { comment }));
    },
    async reject(id: string, comment?: string): Promise<ActionResponse<ModuleEstimation>> {
        return unwrap(await apiClient.post<ModuleEstimation>(`${BASE}/estimations/${encodeURIComponent(id)}/reject`, { comment }));
    },
    async reopen(id: string): Promise<ActionResponse<ModuleEstimation>> {
        return unwrap(await apiClient.post<ModuleEstimation>(`${BASE}/estimations/${encodeURIComponent(id)}/reopen`));
    },
    async selectFinal(id: string): Promise<ActionResponse<ModuleEstimation>> {
        return unwrap(await apiClient.post<ModuleEstimation>(`${BASE}/estimations/${encodeURIComponent(id)}/select-final`));
    },
    async getComparisons(moduleId: string): Promise<ActionResponse<ModuleEstimation[]>> {
        return unwrap(await apiClient.get<ModuleEstimation[]>(`${BASE}/modules/${encodeURIComponent(moduleId)}/comparisons`));
    },
    async getReviewQueue(projectId: string): Promise<ActionResponse<ModuleEstimation[]>> {
        return unwrap(await apiClient.get<ModuleEstimation[]>(`${BASE}/projects/${encodeURIComponent(projectId)}/review-queue`));
    },
    async getReviewEvents(id: string): Promise<ActionResponse<EstimationReviewEvent[]>> {
        return unwrap(await apiClient.get<EstimationReviewEvent[]>(`${BASE}/estimations/${encodeURIComponent(id)}/review-history`));
    },
};
