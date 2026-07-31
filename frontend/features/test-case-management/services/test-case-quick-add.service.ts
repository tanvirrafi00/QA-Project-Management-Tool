/**
 * Quick Add Test Case Service
 * Handles quick add operations for test cases from the list page
 */

import {
    apiClient,
    type ActionResponse,
} from '@/lib/api-client';

export interface QuickAddTestCaseInput {
    projectName: string;
    module: string;
    subModule?: string;
    tcId?: string;
    name: string;
    description?: string;
    type?: string;
    priority: string;
    testSteps: string[];
    expectedResult: string;
    testStatus?: string;
    actualResult?: string;
    assignedTo?: string;
    executionDate?: string;
    comments?: string;
    relatedBugs?: string[];
    tags?: string[];
}

export interface QuickAddTestCaseResponse {
    tcId: string;
    name: string;
    module: string;
    priority: string;
}

/**
 * Quick add a single test case
 */
export async function quickAddTestCase(
    input: QuickAddTestCaseInput
): Promise<ActionResponse<QuickAddTestCaseResponse>> {
    try {
        const response = await apiClient.post<QuickAddTestCaseResponse>(
            '/api/test-cases/quick-add',
            input
        );

        if (!response.success) {
            return {
                success: false,
                error: response.error,
            };
        }

        return {
            success: true,
            data: response.data,
        };
    } catch (error: any) {
        return {
            success: false,
            error: error.message || 'Failed to add test case',
        };
    }
}
