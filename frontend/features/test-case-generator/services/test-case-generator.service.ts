/**
 * Client Service for the Test Case Generator feature.
 * HTTP concerns go through `apiClient`, except the health endpoint which is not envelope-wrapped.
 */

import { TestCaseInput, TestGenerationResponse, GenerationResult, TestCase, RepositorySaveResult, GenerationJobSnapshot } from '../types';
import { apiClient, type ActionResponse } from '@/lib/api-client';

export const testCaseGeneratorService = {
    /**
     * Generate test cases using the multi-agent AI system.
     */
    async generateTestCases(input: TestCaseInput): Promise<GenerationResult> {
        if (!input.userStory || input.userStory.trim().length < 10) {
            return { success: false, error: 'User story must be at least 10 characters long' };
        }

        const res = await apiClient.post<TestGenerationResponse>('/api/generate/test-cases', input);
        if (res.success && res.data) {
            return { success: true, data: res.data };
        }
        return { success: false, error: res.error || 'Failed to generate test cases' };
    },

    /**
     * Phase 6 — create a generation job. Returns immediately with { jobId, status }; generation
     * runs in the background. Poll with `getGenerationJob` for progress + result.
     */
    async createGenerationJob(input: TestCaseInput): Promise<ActionResponse<{ jobId: string; status: string }>> {
        if (!input.userStory || input.userStory.trim().length < 10) {
            return { success: false, error: 'User story must be at least 10 characters long' };
        }
        return apiClient.post<{ jobId: string; status: string }>('/api/generate/test-cases/async', input);
    },

    /** Poll a generation job: status + progress (+ result when COMPLETED, error when FAILED). */
    async getGenerationJob(jobId: string): Promise<ActionResponse<GenerationJobSnapshot>> {
        return apiClient.get<GenerationJobSnapshot>(`/api/generation-jobs/${jobId}`);
    },

    /** Request cancellation of an in-flight generation job (best-effort, between phases). */
    async cancelGenerationJob(jobId: string): Promise<ActionResponse<GenerationJobSnapshot>> {
        return apiClient.post<GenerationJobSnapshot>(`/api/generation-jobs/${jobId}/cancel`);
    },

    /**
     * Save generated test cases to the repository (user clicks "Save to Repository" in Step 3).
     */
    async saveToRepository(
        projectName: string,
        module: string,
        subModule: string | undefined,
        testCases: TestCase[]
    ): Promise<ActionResponse<RepositorySaveResult>> {
        if (!projectName?.trim()) return { success: false, error: 'Project name is required' };
        if (!module?.trim()) return { success: false, error: 'Module is required' };
        if (!testCases || testCases.length === 0) return { success: false, error: 'No test cases to save' };

        const res = await apiClient.post<TestCase[]>('/api/test-cases/bulk-save', {
            projectName,
            module,
            ...(subModule && { subModule }),
            testCases: testCases.map((tc) => ({
                module,
                name: tc.name || tc.scenario,
                type: tc.type,
                scenario: tc.scenario,
                steps: tc.steps,
                expectedResult: tc.expectedResult,
                priority: tc.priority,
                tags: tc.tags,
            })),
        });

        if (!res.success) return { success: false, error: res.error };

        return {
            success: true,
            data: {
                savedToRepository: true,
                savedCount: res.count ?? 0,
                duplicatesSkipped: (res as { duplicatesSkipped?: number }).duplicatesSkipped ?? 0,
                projectName,
                module,
                ...(subModule && { subModule }),
            },
        };
    },

    /** Health check for the backend API (raw — the health endpoint is not envelope-wrapped). */
    async healthCheck(): Promise<{ status: string; service: string } | null> {
        try {
            const response = await fetch('/api/health', { credentials: 'same-origin' });
            return response.ok ? await response.json() : null;
        } catch {
            return null;
        }
    }
};
