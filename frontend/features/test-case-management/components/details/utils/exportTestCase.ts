/**
 * Single-test-case XLSX export. Mirrors the 12-column format used by the list page export
 * (`app/test-management/page.tsx` handleExportExcel), but with one data row.
 */
import * as XLSX from 'xlsx';
import type { TestCase } from '@/features/test-case-management/types';

export function exportTestCaseToXlsx(tc: TestCase): void {
    const wb = XLSX.utils.book_new();
    const rows = [
        [
            'Module', 'TC ID', 'TC Name', 'Priority', 'Test Steps', 'Expected Results',
            'Test Status', 'Actual Result', 'Assigned To', 'Execution Date', 'Related Bugs', 'Comments',
        ],
        [
            tc.module, tc.tcId, tc.name, tc.priority,
            (tc.testSteps || []).join('\n'),
            tc.expectedResult || '',
            tc.testStatus, tc.actualResult || 'N/A', tc.assignedTo,
            tc.executionDate ? new Date(tc.executionDate).toLocaleDateString() : '',
            (tc.relatedBugs || []).join(', '),
            tc.comments || 'N/A',
        ],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Test Case');
    XLSX.writeFile(wb, `${(tc.tcId || 'TestCase').replace(/\s/g, '_')}.xlsx`);
}
