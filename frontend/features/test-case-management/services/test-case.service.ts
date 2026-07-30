/**
 * Client Service for Test Case Management
 * Backend module mounted at /api/test-cases. All HTTP concerns go through the shared `apiClient`.
 */

import {
    SaveTestCaseInput,
    BulkSaveTestCaseInput,
    UpdateTestCaseInput,
    UpdateTestCaseResult,
    TestCaseHistoryEntry,
    TestCaseAnalytics,
    BulkUpdateInput,
    TestCaseFilter,
    ModuleNode,
    TestCase,
    ImportPreview,
    ImportSaveInput,
    ImportSaveResult,
    ImportErrorType,
    ImportRowError,
} from '../types';
import {
    apiClient,
    paginationFromEnvelope,
    withPagination,
    type ActionResponse,
    type Pagination,
} from '@/lib/api-client';

/**
 * Rich response for the XLSX upload. On failure it carries structured details
 * (`errorType`, `conflictingModules`, `missingColumns`, …) so the page can render
 * a tailored error panel instead of a generic message.
 */
export interface ImportPreviewResponse extends ActionResponse<ImportPreview> {
    errorType?: ImportErrorType;
    conflictingModules?: string[];
    missingColumns?: string[];
    emptySheets?: string[];
    duplicateModules?: string[];
    rowErrors?: ImportRowError[];
}

export const testCaseService = {
    /** List test cases with optional filters + opt-in server-side pagination. */
    async listTestCases(
        params?: TestCaseFilter & { page?: number; pageSize?: number }
    ): Promise<ActionResponse<TestCase[]> & { count?: number; pagination?: Pagination }> {
        const query = new URLSearchParams();
        if (params?.projectName) query.set('project', params.projectName);
        if (params?.module) query.set('module', params.module);
        if (params?.subModule) query.set('subModule', params.subModule);
        if (params?.priority) query.set('priority', params.priority);
        if (params?.testStatus) query.set('status', params.testStatus);
        if (params?.type) query.set('type', params.type);
        if (params?.assignedTo) query.set('assignedTo', params.assignedTo);
        if (params?.search) query.set('search', params.search);
        withPagination(query, params);

        const res = await apiClient.get<TestCase[]>(`/api/test-cases?${query.toString()}`);
        return {
            success: res.success,
            data: res.data,
            error: res.error,
            count: res.count,
            pagination: paginationFromEnvelope(res),
        };
    },

    /** Get a single test case by ID (accepts internal id or display tcId). */
    async getTestCase(id: string): Promise<ActionResponse<TestCase>> {
        return apiClient.get<TestCase>(`/api/test-cases/${id}`);
    },

    /** Save a single test case. */
    async saveTestCase(input: SaveTestCaseInput): Promise<ActionResponse<TestCase>> {
        return apiClient.post<TestCase>('/api/test-cases/save', input);
    },

    /** Bulk save test cases from the generator (with duplicate detection). */
    async bulkSaveTestCases(
        input: BulkSaveTestCaseInput
    ): Promise<ActionResponse<TestCase[]> & { count?: number; duplicatesSkipped?: number; total?: number }> {
        const res = await apiClient.post<TestCase[]>('/api/test-cases/bulk-save', input);
        return {
            success: res.success,
            data: res.data,
            error: res.error,
            count: res.count,
            duplicatesSkipped: (res as { duplicatesSkipped?: number }).duplicatesSkipped,
            total: res.total,
        };
    },

    /** Update a test case (edit fields with change tracking). */
    async updateTestCase(
        id: string,
        updates: UpdateTestCaseInput
    ): Promise<ActionResponse<UpdateTestCaseResult>> {
        const res = await apiClient.patch<TestCase>(`/api/test-cases/${id}`, updates);
        if (!res.success || !res.data) {
            return { success: false, error: res.error };
        }
        return {
            success: true,
            data: { testCase: res.data, changes: res.changes ?? [], version: res.version ?? 1 },
        };
    },

    /** Bulk update test cases (status, assignee). */
    async bulkUpdateTestCases(
        input: BulkUpdateInput
    ): Promise<ActionResponse<TestCase[]> & { updated?: number }> {
        const res = await apiClient.patch<TestCase[]>('/api/test-cases/bulk-update', input);
        return { success: res.success, data: res.data, error: res.error, updated: res.updated };
    },

    /** Delete a test case. */
    async deleteTestCase(id: string): Promise<ActionResponse<never>> {
        return apiClient.delete<never>(`/api/test-cases/${id}`);
    },

    /** Delete every test case in a module for a project (the "delete whole module" action). */
    async deleteModule(
        projectName: string,
        module: string,
    ): Promise<ActionResponse<{ deleted: number; module: string; projectName: string }>> {
        const query = new URLSearchParams({ project: projectName, module });
        return apiClient.delete<{ deleted: number; module: string; projectName: string }>(
            `/api/test-cases/modules?${query.toString()}`,
        );
    },

    /** Get test-case analytics for the dashboard (optionally scoped to a project). */
    async getTestCaseAnalytics(
        projectName?: string
    ): Promise<ActionResponse<TestCaseAnalytics>> {
        const path = projectName
            ? `/api/test-cases/analytics?project=${encodeURIComponent(projectName)}`
            : '/api/test-cases/analytics';
        return apiClient.get<TestCaseAnalytics>(path);
    },

    /** Get module tree (module → sub-modules with counts). */
    async getModuleTree(projectName?: string): Promise<ActionResponse<ModuleNode[]>> {
        const path = projectName
            ? `/api/test-cases/modules?project=${encodeURIComponent(projectName)}`
            : '/api/test-cases/modules';
        return apiClient.get<ModuleNode[]>(path);
    },

    /** Get test-case edit history (audit trail). */
    async getTestCaseHistory(
        id: string
    ): Promise<ActionResponse<TestCaseHistoryEntry[]>> {
        const res = await apiClient.get<TestCaseHistoryEntry[]>(`/api/test-cases/${id}/history`);
        return { success: res.success, data: res.data ?? [], error: res.error };
    },

    /**
     * Upload an XLSX file for import (multipart/form-data). Goes through the dedicated Route
     * Handler at `/api/test-cases/import` (NOT the catch-all, which would corrupt the binary body).
     * We must NOT set Content-Type — the browser sets the multipart boundary. Returns a rich
     * response with structured error details on failure.
     */
    async importTestCases(file: File, projectName: string): Promise<ImportPreviewResponse> {
        const form = new FormData();
        form.append('file', file);
        form.append('projectName', projectName);

        try {
            const res = await fetch('/api/test-cases/import', {
                method: 'POST',
                body: form,
                credentials: 'same-origin',
            });
            const body = (await res.json().catch(() => ({}))) as {
                success?: boolean;
                data?: ImportPreview;
                error?: string;
                message?: string;
                errorType?: ImportErrorType;
                conflictingModules?: string[];
                missingColumns?: string[];
                emptySheets?: string[];
                duplicateModules?: string[];
                rowErrors?: ImportRowError[];
            };

            if (!res.ok || !body.success) {
                return {
                    success: false,
                    error: body.error || body.message || `Upload failed (${res.status})`,
                    errorType: body.errorType,
                    conflictingModules: body.conflictingModules,
                    missingColumns: body.missingColumns,
                    emptySheets: body.emptySheets,
                    duplicateModules: body.duplicateModules,
                    rowErrors: body.rowErrors,
                };
            }
            return { success: true, data: body.data };
        } catch (err) {
            return {
                success: false,
                error: err instanceof Error ? err.message : 'Network error',
            };
        }
    },

    /** Persist a validated import preview (JSON; goes through the catch-all normally). */
    async saveImportedTestCases(input: ImportSaveInput): Promise<ActionResponse<ImportSaveResult>> {
        const res = await apiClient.post<unknown[]>('/api/test-cases/import/save', input);
        if (!res.success) {
            return { success: false, error: res.error };
        }
        // Backend returns `{ data: [...saved], meta: { total, modulesCreated } }`.
        const meta = (res as unknown as { meta?: { total?: number; modulesCreated?: number } }).meta ?? {};
        const saved = res.data ?? [];
        return {
            success: true,
            data: {
                total: meta.total ?? saved.length,
                modulesCreated: meta.modulesCreated ?? 0,
            },
        };
    }
};
