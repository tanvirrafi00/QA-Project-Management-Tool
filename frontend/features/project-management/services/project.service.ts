/**
 * Client Service for Project Management
 * Backend module mounted at /api/projects. All HTTP concerns go through the shared `apiClient`
 * (single source of truth for the URL, envelope, error handling, pagination).
 */

import {
    CreateProjectInput,
    UpdateProjectInput,
    UpdateProjectResult,
    ProjectFilter,
    Project,
    ProjectWithStats,
    ProjectSummary,
    DeleteCheckResult,
    ProjectHistoryEntry,
    ProjectMember,
} from '../types';
import {
    apiClient,
    paginationFromEnvelope,
    withPagination,
    type ActionResponse,
    type Pagination,
} from '@/lib/api-client';

export const projectService = {
    /** Create a new project. */
    async createProject(input: CreateProjectInput): Promise<ActionResponse<Project>> {
        return apiClient.post<Project>('/api/projects', input);
    },

    /** List projects with optional filters + search + opt-in server-side pagination. */
    async listProjects(
        params?: ProjectFilter & { page?: number; pageSize?: number }
    ): Promise<ActionResponse<ProjectWithStats[]> & { pagination?: Pagination }> {
        const query = new URLSearchParams();
        if (params?.status) query.set('status', params.status);
        if (params?.projectType) query.set('type', params.projectType);
        if (params?.search) query.set('search', params.search);
        withPagination(query, params);

        const res = await apiClient.get<ProjectWithStats[]>(`/api/projects?${query.toString()}`);
        return { success: res.success, data: res.data, error: res.error, pagination: paginationFromEnvelope(res) };
    },

    /** Dashboard summary cards (totals across all projects). */
    async getProjectSummary(): Promise<ActionResponse<ProjectSummary>> {
        return apiClient.get<ProjectSummary>('/api/projects/summary');
    },

    /** Active projects — used by the global project selector. */
    async listActiveProjects(): Promise<ActionResponse<Project[]>> {
        return apiClient.get<Project[]>('/api/projects/active');
    },

    /** Get a single project (with live statistics). Accepts id, code or name. */
    async getProject(idOrCodeOrName: string): Promise<ActionResponse<ProjectWithStats>> {
        return apiClient.get<ProjectWithStats>(
            `/api/projects/${encodeURIComponent(idOrCodeOrName)}`
        );
    },

    /** Update a project (code is not editable). */
    async updateProject(
        idOrCodeOrName: string,
        updates: UpdateProjectInput
    ): Promise<ActionResponse<UpdateProjectResult>> {
        const res = await apiClient.patch<Project>(
            `/api/projects/${encodeURIComponent(idOrCodeOrName)}`,
            updates
        );
        if (!res.success || !res.data) {
            return { success: false, error: res.error };
        }
        return {
            success: true,
            data: { project: res.data, changes: res.changes ?? [], version: res.version ?? 1 },
        };
    },

    /** Archive a project (soft delete / read-only). */
    async archiveProject(
        idOrCodeOrName: string,
        changedBy = 'QA Team'
    ): Promise<ActionResponse<Project>> {
        return apiClient.patch<Project>(
            `/api/projects/${encodeURIComponent(idOrCodeOrName)}/archive`,
            { changedBy }
        );
    },

    /** Restore an archived project. */
    async restoreProject(
        idOrCodeOrName: string,
        changedBy = 'QA Team'
    ): Promise<ActionResponse<Project>> {
        return apiClient.patch<Project>(
            `/api/projects/${encodeURIComponent(idOrCodeOrName)}/restore`,
            { changedBy }
        );
    },

    /** Pre-delete safety check. */
    async getDeleteCheck(idOrCodeOrName: string): Promise<ActionResponse<DeleteCheckResult>> {
        return apiClient.get<DeleteCheckResult>(
            `/api/projects/${encodeURIComponent(idOrCodeOrName)}/delete-check`
        );
    },

    /** Delete a project. Refuses when associated data exists unless force=true. */
    async deleteProject(
        idOrCodeOrName: string,
        force = false
    ): Promise<ActionResponse<never>> {
        return apiClient.delete<never>(
            `/api/projects/${encodeURIComponent(idOrCodeOrName)}?force=${force}`
        );
    },

    /** Audit history for a project. */
    async getProjectHistory(
        idOrCodeOrName: string
    ): Promise<ActionResponse<ProjectHistoryEntry[]>> {
        const res = await apiClient.get<ProjectHistoryEntry[]>(
            `/api/projects/${encodeURIComponent(idOrCodeOrName)}/history`
        );
        return { success: res.success, data: res.data ?? [], error: res.error };
    },

    /** Active members of a project — feeds the bug "Assigned To" dropdown. Accepts id, code or name. */
    async getProjectMembers(
        idOrCodeOrName: string
    ): Promise<ActionResponse<ProjectMember[]>> {
        const res = await apiClient.get<ProjectMember[]>(
            `/api/projects/${encodeURIComponent(idOrCodeOrName)}/members`
        );
        return { success: res.success, data: res.data ?? [], error: res.error };
    }
};
