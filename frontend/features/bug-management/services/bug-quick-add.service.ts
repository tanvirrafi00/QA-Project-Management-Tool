/**
 * Quick Add Bug Service
 * Handles quick add operations for bugs from the list page
 */

import {
    apiClient,
    type ActionResponse,
} from '@/lib/api-client';

export interface QuickAddBugInput {
    projectName: string;
    module: string;
    bugId?: string;
    title: string;
    severity: string;
    priority: string;
    status?: string;
    layer?: string;
    description?: string;
    environment?: string;
    precondition?: string;
    currentBehavior?: string[];
    stepsToReproduce: string[];
    expectedResult: string;
    actualResult: string;
    impact?: string;
    assignee?: string;
    possibleRootCause?: string;
    suggestedFix?: string;
    similarBugs?: string[];
    missingInfo?: string[];
    tags?: string[];
}

export interface QuickAddBugResponse {
    bugId: string;
    title: string;
    module: string;
    severity: string;
    priority: string;
}

/**
 * Quick add a single bug
 */
export async function quickAddBug(
    input: QuickAddBugInput
): Promise<ActionResponse<QuickAddBugResponse>> {
    try {
        const response = await apiClient.post<QuickAddBugResponse>(
            '/api/bugs/quick-add',
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
            error: error.message || 'Failed to add bug',
        };
    }
}
