/**
 * Bug Paste Service
 * Handles paste operations for bugs from the list page
 */

import {
    apiClient,
    type ActionResponse,
} from '@/lib/api-client';

export interface BugPasteRow {
    bugId: string;
    module: string;
    title: string;
    severity: string;
    priority: string;
    description?: string;
    stepsToReproduce: string[];
    expectedResult: string;
    actualResult: string;
    impact?: string;
    status: string;
    assignee?: string;
}

export interface BugPastePreview {
    projectName: string;
    bugs: BugPasteRow[];
    totalBugs: number;
}

export interface BugPasteSaveInput {
    projectName: string;
    bugs: BugPasteRow[];
}

export interface BugPasteSaveResult {
    saved: any[];
    total: number;
}

/**
 * Parse and validate pasted bug table
 */
export async function parsePaste(text: string, projectName: string): Promise<ActionResponse<BugPastePreview>> {
    try {
        const response = await apiClient.post<BugPastePreview>(
            '/api/bugs/paste',
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
 * Save pasted bugs
 */
export async function savePaste(input: BugPasteSaveInput): Promise<ActionResponse<BugPasteSaveResult>> {
    try {
        const response = await apiClient.post<BugPasteSaveResult>(
            '/api/bugs/paste/save',
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
