/**
 * Client Service for Bug Management
 * Backend module mounted at /api/bugs. All HTTP concerns go through the shared `apiClient`.
 */

import {
    BugGenerationInput,
    BugGenerationResult,
    SaveBugInput,
    UpdateBugInput,
    UpdateBugResult,
    BugHistoryEntry,
    Bug,
    BugAnalytics,
    BugImportPreview,
    BugImportSaveInput,
    BugImportSaveResult,
    BugImportErrorType,
    BugImportRowError,
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
 * (`errorType`, `missingColumns`, `rowErrors`, `duplicateBugIds`, `existingBugIds`) so the page can
 * render a tailored error panel instead of a generic message. Mirrors the test-case import response.
 */
export interface BugImportPreviewResponse extends ActionResponse<BugImportPreview> {
    errorType?: BugImportErrorType;
    missingColumns?: string[];
    rowErrors?: BugImportRowError[];
    duplicateBugIds?: string[];
    existingBugIds?: string[];
}

export const bugService = {
    /** Generate a professional bug report using AI. */
    async generateBug(
        input: BugGenerationInput
    ): Promise<ActionResponse<BugGenerationResult>> {
        return apiClient.post<BugGenerationResult>('/api/bugs/generate', input);
    },

    /** Save a bug to the repository. */
    async saveBug(input: SaveBugInput): Promise<ActionResponse<Bug>> {
        return apiClient.post<Bug>('/api/bugs/save', input);
    },

    /** List bugs with optional filters + opt-in server-side pagination. */
    async listBugs(
        params?: {
            projectName?: string;
            layer?: string;
            severity?: string;
            status?: string;
            search?: string;
            page?: number;
            pageSize?: number;
        }
    ): Promise<ActionResponse<Bug[]> & { pagination?: Pagination }> {
        const query = new URLSearchParams();
        if (params?.projectName) query.set('project', params.projectName);
        if (params?.layer) query.set('layer', params.layer);
        if (params?.severity) query.set('severity', params.severity);
        if (params?.status) query.set('status', params.status);
        if (params?.search) query.set('search', params.search);
        withPagination(query, params);

        const res = await apiClient.get<Bug[]>(`/api/bugs?${query.toString()}`);
        return { success: res.success, data: res.data, error: res.error, pagination: paginationFromEnvelope(res) };
    },

    /** Get bug analytics for the dashboard (optionally scoped to a project). */
    async getBugAnalytics(projectName?: string): Promise<ActionResponse<BugAnalytics>> {
        const path = projectName
            ? `/api/bugs/analytics?project=${encodeURIComponent(projectName)}`
            : '/api/bugs/analytics';
        return apiClient.get<BugAnalytics>(path);
    },

    /** Update a bug (edit fields with change tracking). */
    async updateBug(
        id: string,
        updates: UpdateBugInput
    ): Promise<ActionResponse<UpdateBugResult>> {
        const res = await apiClient.patch<Bug>(`/api/bugs/${id}`, updates);
        if (!res.success || !res.data) {
            return { success: false, error: res.error };
        }
        return {
            success: true,
            data: { bug: res.data, changes: res.changes ?? [], version: res.version ?? 1 },
        };
    },

    /** Get bug edit history (audit trail). */
    async getBugHistory(id: string): Promise<ActionResponse<BugHistoryEntry[]>> {
        const res = await apiClient.get<BugHistoryEntry[]>(`/api/bugs/${id}/history`);
        return { success: res.success, data: res.data ?? [], error: res.error };
    },

    /** Get a single bug by ID (accepts internal id or display bugId). */
    async getBug(id: string): Promise<ActionResponse<Bug>> {
        return apiClient.get<Bug>(`/api/bugs/${id}`);
    },

    /** Delete a bug. */
    async deleteBug(id: string): Promise<ActionResponse<never>> {
        return apiClient.delete<never>(`/api/bugs/${id}`);
    },

    /**
     * Upload an XLSX file for import (multipart/form-data). Goes through the dedicated Route Handler
     * at `/api/bugs/import` (NOT the catch-all, which would corrupt the binary body). We must NOT set
     * Content-Type — the browser sets the multipart boundary. Returns a rich response with structured
     * error details on failure.
     */
    async importBugs(file: File, projectName: string): Promise<BugImportPreviewResponse> {
        const form = new FormData();
        form.append('file', file);
        form.append('projectName', projectName);

        try {
            const res = await fetch('/api/bugs/import', {
                method: 'POST',
                body: form,
                credentials: 'same-origin',
            });
            const body = (await res.json().catch(() => ({}))) as {
                success?: boolean;
                data?: BugImportPreview;
                error?: string;
                message?: string;
                errorType?: BugImportErrorType;
                missingColumns?: string[];
                rowErrors?: BugImportRowError[];
                duplicateBugIds?: string[];
                existingBugIds?: string[];
            };

            if (!res.ok || !body.success) {
                return {
                    success: false,
                    error: body.error || body.message || `Upload failed (${res.status})`,
                    errorType: body.errorType,
                    missingColumns: body.missingColumns,
                    rowErrors: body.rowErrors,
                    duplicateBugIds: body.duplicateBugIds,
                    existingBugIds: body.existingBugIds,
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
    async saveImportedBugs(input: BugImportSaveInput): Promise<ActionResponse<BugImportSaveResult>> {
        const res = await apiClient.post<unknown[]>('/api/bugs/import/save', input);
        if (!res.success) {
            return { success: false, error: res.error };
        }
        // Backend returns `{ data: [...saved], meta: { total } }`.
        const meta = (res as unknown as { meta?: { total?: number } }).meta ?? {};
        return { success: true, data: { total: meta.total ?? 0 } };
    }
};
