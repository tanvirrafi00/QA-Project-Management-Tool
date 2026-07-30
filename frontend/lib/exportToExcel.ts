/**
 * Export to Excel Utility
 * Exports test cases in the Standard Test Case Format for QA execution
 *
 * Standard Format:
 * Module | TC ID | TC Name | Priority | Test Steps | Expected Results |
 * Test Status | Actual Result | Assigned To | Execution Date | Related Bugs | Comments
 */

import * as XLSX from 'xlsx';

export interface ExportTestCase {
  id: string;
  module?: string;
  name?: string;
  scenario?: string;
  type: string;
  steps: string[];
  expectedResult: string;
  priority: string;
  tags: string[];
  // Execution fields (with defaults)
  testStatus?: string;
  actualResult?: string;
  assignedTo?: string;
  executionDate?: string;
  relatedBugs?: string;
  comments?: string;
}

export interface ExportGap {
  category: string;
  severity: string;
  description: string;
  risk: string;
}

export interface ExportAPITest {
  id: string;
  endpoint: string;
  method: string;
  type: string;
  description: string;
  expectedStatus: number;
  assertions: string[];
}

// Default values as specified in the plan
const DEFAULTS = {
  testStatus: 'Not Executed',
  actualResult: 'N/A',
  assignedTo: 'Unassigned',
  executionDate: '',
  relatedBugs: 'N/A',
  comments: 'N/A',
};

/**
 * Build a row for the standard test case format
 */
function buildTestCaseRow(tc: ExportTestCase): Record<string, string> {
  return {
    'Module': tc.module || 'General',
    'TC ID': tc.id,
    'TC Name': tc.name || tc.scenario || 'Test Case',
    'Priority': tc.priority || 'Medium',
    'Test Steps': Array.isArray(tc.steps) ? tc.steps.join('\n') : String(tc.steps || ''),
    'Expected Results': tc.expectedResult || '',
    'Test Status': tc.testStatus || DEFAULTS.testStatus,
    'Actual Result': tc.actualResult || DEFAULTS.actualResult,
    'Assigned To': tc.assignedTo || DEFAULTS.assignedTo,
    'Execution Date': tc.executionDate || DEFAULTS.executionDate,
    'Related Bugs': tc.relatedBugs || DEFAULTS.relatedBugs,
    'Comments': tc.comments || DEFAULTS.comments,
  };
}

/**
 * Apply formatting to worksheet:
 * - Bold header row
 * - Freeze first row
 * - Set column widths
 */
function formatWorksheet(ws: XLSX.WorkSheet, columnWidths: number[]) {
  // Freeze the first row (header)
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };

  // Set column widths
  ws['!cols'] = columnWidths.map(wch => ({ wch }));

  // Bold the header row (cells A1, B1, etc.)
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let col = range.s.c; col <= range.e.c; col++) {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c: col });
    if (ws[cellRef]) {
      ws[cellRef].s = {
        font: { bold: true },
        alignment: { horizontal: 'center', vertical: 'center' },
      };
    }
  }
}

// Column widths as specified in the plan
const STANDARD_COLUMN_WIDTHS = [
  25,  // Module
  15,  // TC ID
  40,  // TC Name
  15,  // Priority
  60,  // Test Steps
  60,  // Expected Results
  15,  // Test Status
  20,  // Actual Result
  20,  // Assigned To
  18,  // Execution Date
  15,  // Related Bugs
  40,  // Comments
];

/**
 * Generate filename in the standard format:
 * {ModuleName}_TestCases_YYYY-MM-DD.xlsx
 */
function generateFileName(moduleName?: string): string {
  const date = new Date().toISOString().split('T')[0];
  const cleanModule = (moduleName || 'TestCases')
    .replace(/[^a-zA-Z0-9]/g, '')
    .replace(/\s+/g, '');
  return `${cleanModule}_TestCases_${date}.xlsx`;
}

/**
 * Export test cases to Excel in Standard Test Case Format
 */
export function exportTestCasesToExcel(testCases: ExportTestCase[], fileName?: string, moduleName?: string) {
  // Build rows with all standard columns
  const worksheetData = testCases.map(tc => buildTestCaseRow(tc));

  // Create workbook
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(worksheetData);

  // Apply formatting
  formatWorksheet(ws, STANDARD_COLUMN_WIDTHS);

  XLSX.utils.book_append_sheet(wb, ws, 'Test Cases');

  // Generate filename
  const finalFileName = fileName || generateFileName(moduleName || testCases[0]?.module);

  // Download
  XLSX.writeFile(wb, finalFileName);
}

/**
 * Export gap analysis to Excel
 */
export function exportGapsToExcel(gaps: ExportGap[], fileName?: string) {
  const worksheetData = gaps.map((gap) => ({
    'Category': gap.category,
    'Severity': gap.severity,
    'Description': gap.description,
    'Risk': gap.risk,
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(worksheetData);

  formatWorksheet(ws, [20, 12, 50, 30]);

  XLSX.utils.book_append_sheet(wb, ws, 'Gap Analysis');

  const defaultFileName = `GapAnalysis_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(wb, fileName || defaultFileName);
}

/**
 * Export API tests to Excel
 */
export function exportAPITestsToExcel(tests: ExportAPITest[], fileName?: string) {
  const worksheetData = tests.map((test) => ({
    'Test ID': test.id,
    'Endpoint': test.endpoint,
    'Method': test.method,
    'Test Type': test.type,
    'Description': test.description,
    'Expected Status': test.expectedStatus,
    'Assertions': test.assertions.join('\n'),
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(worksheetData);

  formatWorksheet(ws, [12, 30, 10, 15, 40, 15, 50]);

  XLSX.utils.book_append_sheet(wb, ws, 'API Tests');

  const defaultFileName = `APITests_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(wb, fileName || defaultFileName);
}

/**
 * Export multiple sheets to single Excel file
 */
export function exportCombinedToExcel(data: {
  testCases?: ExportTestCase[];
  gaps?: ExportGap[];
  apiTests?: ExportAPITest[];
}, fileName?: string, moduleName?: string) {
  const wb = XLSX.utils.book_new();

  // Add test cases sheet (standard format)
  if (data.testCases && data.testCases.length > 0) {
    const tcData = data.testCases.map(tc => buildTestCaseRow(tc));
    const ws = XLSX.utils.json_to_sheet(tcData);
    formatWorksheet(ws, STANDARD_COLUMN_WIDTHS);
    XLSX.utils.book_append_sheet(wb, ws, 'Test Cases');
  }

  // Add gaps sheet
  if (data.gaps && data.gaps.length > 0) {
    const gapData = data.gaps.map((gap) => ({
      'Category': gap.category,
      'Severity': gap.severity,
      'Description': gap.description,
      'Risk': gap.risk,
    }));
    const ws = XLSX.utils.json_to_sheet(gapData);
    formatWorksheet(ws, [20, 12, 50, 30]);
    XLSX.utils.book_append_sheet(wb, ws, 'Gap Analysis');
  }

  // Add API tests sheet
  if (data.apiTests && data.apiTests.length > 0) {
    const apiData = data.apiTests.map((test) => ({
      'Test ID': test.id,
      'Endpoint': test.endpoint,
      'Method': test.method,
      'Test Type': test.type,
      'Description': test.description,
      'Expected Status': test.expectedStatus,
      'Assertions': test.assertions.join('\n'),
    }));
    const ws = XLSX.utils.json_to_sheet(apiData);
    formatWorksheet(ws, [12, 30, 10, 15, 40, 15, 50]);
    XLSX.utils.book_append_sheet(wb, ws, 'API Tests');
  }

  const finalFileName = fileName || generateFileName(moduleName);
  XLSX.writeFile(wb, finalFileName);
}
