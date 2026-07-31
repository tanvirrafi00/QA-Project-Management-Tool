/**
 * Test Case Paste Service
 * Handles paste operations for test cases from the list page
 */

import {
    apiClient,
    type ActionResponse,
} from '@/lib/api-client';

// Re-export the backend types for consistency
export type TestCasePasteRow = import('@/features/test-case-management/types').ImportTestCaseRow;
export type ImportedModule = import('@/features/test-case-management/types').ImportedModule;
export type ImportPreview = import('@/features/test-case-management/types').ImportPreview;
export type ImportSaveInput = import('@/features/test-case-management/types').ImportSaveInput;
export type ImportSaveResult = import('@/features/test-case-management/types').ImportSaveResult;

/**
 * Parse and validate pasted test case table
 */
export async function parsePaste(text: string, projectName: string): Promise<ActionResponse<ImportPreview>> {
    try {
        const response = await apiClient.post<ImportPreview>(
            '/api/test-cases/paste',
            { text, projectName }
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
            error: error.message || 'Failed to parse paste',
        };
    }
}

/**
 * Save pasted test cases
 */
export async function savePaste(input: ImportSaveInput): Promise<ActionResponse<ImportSaveResult>> {
    try {
        const response = await apiClient.post<ImportSaveResult>(
            '/api/test-cases/paste/save',
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
            error: error.message || 'Failed to save paste',
        };
    }
}
