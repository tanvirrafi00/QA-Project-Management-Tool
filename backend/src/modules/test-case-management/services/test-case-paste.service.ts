/**
 * Test Case Paste Parser Service
 *
 * Business logic for parsing pasted table data (Markdown, TSV, Excel, Google Sheets)
 * for quick test case addition. Mirrors the Excel import service but accepts text paste.
 *
 * Lives in the service layer (architecture-guidelines.md §3): HTTP stays in the controller,
 * parsing/validation logic is here, persistence is in the repository.
 */

import {
    ImportPreview,
    ImportedModule,
    ImportSaveInput,
    ImportSaveResult,
    ImportTestCaseRow,
    TestCasePriority,
    TestCaseStatus,
    TestCasePasteErrorType,
    TestCasePasteValidationError,
} from '../types';
import testCaseRepository from '../repositories/test-case.repository';
import logger from '../../../shared/logger';

// ── Column mapping ─────────────────────────────────────

/** Fixed column order for header-less parsing */
const FIXED_COLUMN_ORDER: FieldKey[] = [
    'module',
    'tcId',
    'name',
    'priority',
    'testSteps',
    'expectedResult',
    'testStatus',
    'actualResult',
    'assignedTo',
    'executionDate',
    'relatedBugs',
    'comments'
];

/** Canonical field keys we map pasted headers onto. */
type FieldKey =
    | 'tcId'
    | 'name'
    | 'priority'
    | 'testSteps'
    | 'expectedResult'
    | 'testStatus'
    | 'actualResult'
    | 'assignedTo'
    | 'executionDate'
    | 'relatedBugs'
    | 'comments'
    | 'module';

/** Normalized header text → canonical field. Keys are lowercased, alphanumeric-only. */
const HEADER_ALIASES: Record<string, FieldKey> = {
    tcid: 'tcId',
    testcaseid: 'tcId',
    id: 'tcId',
    tcname: 'name',
    testcasename: 'name',
    name: 'name',
    title: 'name',
    priority: 'priority',
    teststeps: 'testSteps',
    steps: 'testSteps',
    expectedresults: 'expectedResult',
    expectedresult: 'expectedResult',
    expected: 'expectedResult',
    teststatus: 'testStatus',
    status: 'testStatus',
    actualresult: 'actualResult',
    actual: 'actualResult',
    assignedto: 'assignedTo',
    assignee: 'assignedTo',
    executiondate: 'executionDate',
    relatedbugs: 'relatedBugs',
    bugs: 'relatedBugs',
    comments: 'comments',
    comment: 'comments',
};

/** Headers that MUST be present in every pasted table. */
const REQUIRED_FIELDS: FieldKey[] = ['name', 'priority', 'testSteps', 'expectedResult', 'module'];

const VALID_PRIORITIES: TestCasePriority[] = ['Critical', 'High', 'Medium', 'Low'];
const VALID_STATUSES: TestCaseStatus[] = ['Not Executed', 'Passed', 'Failed', 'Blocked', 'Skipped'];

/** Max rows accepted in a single paste. */
export const MAX_PASTE_ROWS = 1000;

/** Normalize a header cell: lowercase, strip non-alphanumeric. */
function normalizeHeader(raw: unknown): string {
    return String(raw ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

/** Coerce a cell value to a trimmed string. */
function cellToString(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value.toISOString();
    return String(value).trim();
}

/** Normalize a priority string to the canonical enum (default Medium). */
function normalizePriority(raw: string): TestCasePriority {
    const p = raw.toLowerCase().trim();
    if (p.includes('critical') || p === 'p0') return 'Critical';
    if (p.includes('high') || p === 'p1') return 'High';
    if (p.includes('low') || p === 'p3') return 'Low';
    if (p.includes('medium') || p === 'p2') return 'Medium';
    return 'Medium';
}

/** Normalize a status string to the canonical enum (default Not Executed). */
function normalizeStatus(raw: string): TestCaseStatus {
    const s = raw.toLowerCase().trim();
    if (s.includes('pass')) return 'Passed';
    if (s.includes('fail')) return 'Failed';
    if (s.includes('block')) return 'Blocked';
    if (s.includes('skip')) return 'Skipped';
    if (s.includes('not') || s === '') return 'Not Executed';
    return 'Not Executed';
}

/** Parse an execution date string; returns null when empty/invalid. */
function parseExecutionDate(raw: string): string | null {
    const s = raw.trim();
    if (!s) return null;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d.toISOString();
}

/** Split a multi-line steps cell into a clean step array. */
function splitSteps(raw: string): string[] {
    return cellToString(raw)
        .split(/\r?\n|\r/)
        .map(s => s.trim())
        .filter(s => s.length > 0);
}

/** Split a comma-separated bugs cell into a clean array. */
function splitList(raw: string): string[] {
    return cellToString(raw)
        .split(/[,;]/)
        .map(s => s.trim())
        .filter(s => s.length > 0);
}

/** Detect if the pasted text is Markdown table. */
function isMarkdownTable(text: string): boolean {
    const trimmed = text.trim();
    return trimmed.startsWith('|') && trimmed.includes('|');
}

/** Detect if the pasted text is TSV (Tab-Separated Values). */
function isTSV(text: string): boolean {
    const trimmed = text.trim();
    return trimmed.includes('\t') && !trimmed.startsWith('|');
}

/** Detect if the pasted text is Excel/Google Sheets copy format. */
function isExcelCopy(text: string): boolean {
    const trimmed = text.trim();
    return (
        trimmed.startsWith('=') ||
        trimmed.includes(' ') ||
        trimmed.includes('\n') ||
        trimmed.includes('\r')
    );
}

/**
 * Parse pasted text into a table structure.
 * Detects format automatically: Markdown, TSV, Excel copy, or Google Sheets.
 */
function parsePastedTable(text: string): string[][] {
    const trimmed = text.trim();

    // Try Markdown first
    if (isMarkdownTable(trimmed)) {
        return parseMarkdownTable(trimmed);
    }

    // Try TSV
    if (isTSV(trimmed)) {
        return parseTSV(trimmed);
    }

    // Try Excel/Google Sheets copy
    if (isExcelCopy(trimmed)) {
        return parseExcelCopy(trimmed);
    }

    // Default: try CSV
    return parseCSV(trimmed);
}

/** Parse Markdown table. */
function parseMarkdownTable(text: string): string[][] {
    const lines = text.split(/\r?\n/);
    const table: string[][] = [];

    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
            // Remove leading/trailing | and split by |
            const cells = trimmed
                .slice(1, -1)
                .split('|')
                .map(c => c.trim())
                .filter(c => c.length > 0);
            if (cells.length > 0) {
                table.push(cells);
            }
        }
    }

    return table;
}

/** Parse TSV (Tab-Separated Values). */
function parseTSV(text: string): string[][] {
    const lines = text.split(/\r?\n/);
    const table: string[][] = [];

    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length > 0) {
            const cells = trimmed.split('\t').map(c => c.trim());
            table.push(cells);
        }
    }

    return table;
}

/** Parse Excel/Google Sheets copy format (space-separated with line breaks). */
function parseExcelCopy(text: string): string[][] {
    const lines = text.split(/\r?\n/);
    const table: string[][] = [];
    let currentRow: string[] = [];

    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length > 0) {
            // If line starts with a number or is empty, it's a new row
            if (/^\d/.test(trimmed) || trimmed === '') {
                if (currentRow.length > 0) {
                    table.push(currentRow);
                    currentRow = [];
                }
            }
            // Split by spaces (Excel copy uses spaces as separators)
            const cells = trimmed.split(/\s+/).map(c => c.trim()).filter(c => c.length > 0);
            currentRow = [...currentRow, ...cells];
        }
    }

    if (currentRow.length > 0) {
        table.push(currentRow);
    }

    return table;
}

/** Parse CSV (comma-separated values). */
function parseCSV(text: string): string[][] {
    const lines = text.split(/\r?\n/);
    const table: string[][] = [];

    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length > 0) {
            // Simple CSV parsing (doesn't handle quoted fields with commas)
            const cells = trimmed.split(',').map(c => c.trim()).filter(c => c.length > 0);
            table.push(cells);
        }
    }

    return table;
}

export const testCasePasteService = {
    /**
     * Parse + validate pasted test case table. Does NOT persist.
     * Throws `TestCasePasteValidationError` on any validation failure.
     */
    async parseAndValidate(text: string, projectName: string): Promise<ImportPreview> {
        if (!projectName?.trim()) {
            throw new TestCasePasteValidationError('INVALID_FILE', 'A project must be selected before pasting.');
        }

        if (!text?.trim()) {
            throw new TestCasePasteValidationError('EMPTY_PASTE', 'Please paste some data.');
        }

        // Parse the pasted text into a table
        const table = parsePastedTable(text);

        if (table.length === 0) {
            throw new TestCasePasteValidationError('INVALID_FORMAT', 'Could not parse the pasted data. Please ensure it is a valid table format.');
        }

        // Check if first row contains headers (optional header detection)
        const firstRow = table[0].map(normalizeHeader);
        const hasHeaders = firstRow.some(header => HEADER_ALIASES[header]) && firstRow.length >= FIXED_COLUMN_ORDER.length;

        // Use fixed column order for header-less parsing
        const dataRows = hasHeaders ? table.slice(1) : table;

        // Validate column count for header-less parsing
        if (dataRows.length > 0 && dataRows[0].length !== FIXED_COLUMN_ORDER.length) {
            const expectedColumns = FIXED_COLUMN_ORDER.map(field => prettyField(field)).join(', ');
            throw new TestCasePasteValidationError(
                'INVALID_COLUMNS',
                `Expected ${FIXED_COLUMN_ORDER.length} columns but found ${dataRows[0].length}. Please ensure your data has all required columns in this order: ${expectedColumns}.`,
            );
        }

        // Always use fixed column order mapping for consistency
        const colIndex: Record<FieldKey, number> = {} as Record<FieldKey, number>;
        FIXED_COLUMN_ORDER.forEach((field, idx) => {
            colIndex[field] = idx;
        });

        // If headers are detected, log it but don't change the mapping
        if (hasHeaders) {
            logger.info('Headers detected in paste data, using fixed column order mapping', { headers: firstRow });
        }
        if (dataRows.length === 0) {
            throw new TestCasePasteValidationError('EMPTY_PASTE', 'No data rows found in the pasted table.');
        }

        if (dataRows.length > MAX_PASTE_ROWS) {
            throw new TestCasePasteValidationError(
                'TOO_MANY_ROWS',
                `Too many rows (${dataRows.length}). Maximum allowed is ${MAX_PASTE_ROWS}.`,
            );
        }

        const modules: ImportedModule[] = [];
        const rowErrors: Array<{ row: number; message: string }> = [];
        const moduleGroups: Map<string, ImportTestCaseRow[]> = new Map();

        dataRows.forEach((rawRow, i) => {
            const row = rawRow as unknown[];
            // Skip fully-blank rows.
            const isEmpty = row.every(c => cellToString(c) === '');
            if (isEmpty) return;

            const rowNumber = i + 2; // +2: 1-based, and row 1 is the header
            const get = (field: FieldKey): string => {
                const idx = colIndex[field];
                return idx === undefined ? '' : cellToString(row[idx]);
            };

            const name = get('name');
            const stepsRaw = get('testSteps');
            const expected = get('expectedResult');
            const module = get('module') || 'Imported'; // Default to 'Imported' if module is missing

            // Row-level validation: TC Name, Test Steps, Expected Result are required.
            if (!name) {
                rowErrors.push({ row: rowNumber, message: 'TC Name is required.' });
                return;
            }
            if (!stepsRaw) {
                rowErrors.push({ row: rowNumber, message: 'Test Steps are required.' });
                return;
            }
            if (!expected) {
                rowErrors.push({ row: rowNumber, message: 'Expected Results are required.' });
                return;
            }

            const priorityRaw = get('priority');
            const priority = VALID_PRIORITIES.includes(priorityRaw as TestCasePriority)
                ? (priorityRaw as TestCasePriority)
                : normalizePriority(priorityRaw);

            const testCase: ImportTestCaseRow = {
                tcId: get('tcId'),
                name,
                priority,
                testSteps: splitSteps(stepsRaw),
                expectedResult: expected,
                testStatus: normalizeStatus(get('testStatus')),
                actualResult: get('actualResult'),
                assignedTo: get('assignedTo') || 'Unassigned',
                executionDate: parseExecutionDate(get('executionDate')),
                relatedBugs: splitList(get('relatedBugs')),
                comments: get('comments'),
            };

            // Group test cases by module
            if (!moduleGroups.has(module)) {
                moduleGroups.set(module, []);
            }
            moduleGroups.get(module)!.push(testCase);
        });

        if (rowErrors.length > 0) {
            throw new TestCasePasteValidationError(
                'ROW_VALIDATION',
                `${rowErrors.length} row(s) failed validation. Check that your data follows the expected column order: Module | TC ID | TC Name | Priority | Test Steps | Expected Results | Test Status | Actual Result | Assigned To | Execution Date | Related Bugs | Comments`,
                { rowErrors },
            );
        }

        if (moduleGroups.size === 0) {
            throw new TestCasePasteValidationError('EMPTY_PASTE', 'No valid test case rows found (all rows were blank).');
        }

        // Create modules from grouped test cases
        moduleGroups.forEach((testCases, module) => {
            modules.push({
                module,
                testCases,
            });
        });

        const totalCases = modules.reduce((sum, m) => sum + m.testCases.length, 0);
        logger.info('Test case paste preview built', { projectName, modules: modules.length, totalCases });

        return {
            projectName,
            modules,
            modulesCount: modules.length,
            totalCases,
        };
    },

    /**
     * Persist a validated paste preview into Test Case Management.
     * Re-checks module conflicts (stateless safety) and saves each module via the repository.
     */
    async savePaste(input: ImportSaveInput): Promise<ImportSaveResult> {
        if (!input.projectName?.trim()) {
            throw new TestCasePasteValidationError('INVALID_FILE', 'A project must be selected before saving.');
        }
        if (!input.modules || input.modules.length === 0) {
            throw new TestCasePasteValidationError('INVALID_FILE', 'Nothing to save: no modules in the paste payload.');
        }

        // Re-check conflicts at save time (the preview may have grown stale).
        const conflictingModules: string[] = [];
        for (const mod of input.modules) {
            const existing = await testCaseRepository.getAll({ projectName: input.projectName, module: mod.module });
            if (existing.length > 0) conflictingModules.push(mod.module);
        }
        if (conflictingModules.length > 0) {
            throw new TestCasePasteValidationError(
                'MODULE_EXISTS',
                `Test cases already exist for module(s): ${conflictingModules.join(', ')}. Delete the existing module(s) before pasting.`,
                { conflictingModules },
            );
        }

        const saved = [];
        for (const mod of input.modules) {
            // Rows are saved sequentially, so the repository assigns a monotonically increasing
            // sort_order per row → the stored order matches the paste order exactly.
            const result = await testCaseRepository.bulkSave({
                projectName: input.projectName,
                module: mod.module,
                testCases: mod.testCases.map(tc => ({
                    module: mod.module,
                    name: tc.name,
                    steps: tc.testSteps,
                    expectedResult: tc.expectedResult,
                    priority: tc.priority,
                    tags: [],
                    // Preserve the TC ID (the repo falls back to auto-generation on collision).
                    ...(tc.tcId ? { tcId: tc.tcId } : {}),
                    source: 'imported',
                })),
            });
            saved.push(...result.saved);
        }

        logger.info('Test case paste saved', {
            projectName: input.projectName,
            modulesCreated: input.modules.length,
            saved: saved.length,
        });

        return { saved, total: saved.length, modulesCreated: input.modules.length };
    },
};

/** Human-readable label for a canonical field (used in "missing column" messages). */
function prettyField(field: FieldKey): string {
    const labels: Record<FieldKey, string> = {
        tcId: 'TC ID',
        name: 'TC Name',
        priority: 'Priority',
        testSteps: 'Test Steps',
        expectedResult: 'Expected Results',
        testStatus: 'Test Status',
        actualResult: 'Actual Result',
        assignedTo: 'Assigned To',
        executionDate: 'Execution Date',
        relatedBugs: 'Related Bugs',
        comments: 'Comments',
        module: 'Module',
    };
    return labels[field];
}
