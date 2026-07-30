/**
 * Test Case XLSX Import Service
 *
 * Business logic for the multi-sheet Excel import (each sheet = one module):
 *   1. Parse the workbook with `xlsx`.
 *   2. Validate file/sheet/row structure.
 *   3. Check module conflicts against the repository (no module imported twice).
 *   4. Return a preview (no persistence) — the user confirms before `saveImport`.
 *
 * Lives in the service layer (architecture-guidelines.md §3): HTTP stays in the controller,
 * persistence stays in the repository. This service is stateless and only orchestrates parsing +
 * validation + repository calls, so it remains migration-safe (database-planning.md §8).
 */

import * as XLSX from 'xlsx';
import {
    ImportPreview,
    ImportedModule,
    ImportSaveInput,
    ImportSaveResult,
    ImportTestCaseRow,
    TestCasePriority,
    TestCaseStatus,
    ImportValidationError,
} from '../types';
import testCaseRepository from '../repositories/test-case.repository';
import logger from '../../../shared/logger';

// ── Column mapping ─────────────────────────────────────

/** Canonical field keys we map Excel headers onto. */
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
    | 'comments';

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

/** Headers that MUST be present in every sheet. */
const REQUIRED_FIELDS: FieldKey[] = ['name', 'priority', 'testSteps', 'expectedResult'];

const VALID_PRIORITIES: TestCasePriority[] = ['Critical', 'High', 'Medium', 'Low'];
const VALID_STATUSES: TestCaseStatus[] = ['Not Executed', 'Passed', 'Failed', 'Blocked', 'Skipped'];

/** Max file size accepted by the parser (mirrors the multer limit). */
export const MAX_IMPORT_SIZE_BYTES = 10 * 1024 * 1024;

/** Normalize a header cell: lowercase, strip non-alphanumeric. Accepts any cell type. */
function normalizeHeader(raw: unknown): string {
    return String(raw ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

/** Coerce a cell value to a trimmed string (handles numbers/dates from Excel). */
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

export const testCaseImportService = {
    /**
     * Parse + validate an XLSX buffer and check module conflicts. Does NOT persist.
     * Throws `ImportValidationError` (structured) on any validation failure.
     */
    async parseAndValidate(buffer: Buffer | ArrayBuffer, projectName: string): Promise<ImportPreview> {
        if (!projectName?.trim()) {
            throw new ImportValidationError('INVALID_FILE', 'A project must be selected before importing.');
        }

        let workbook: XLSX.WorkBook;
        try {
            workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
        } catch (err) {
            logger.error('XLSX import: failed to parse workbook', { message: (err as Error).message });
            throw new ImportValidationError('PARSE_ERROR', 'The file is corrupted or is not a valid .xlsx workbook.');
        }

        const sheetNames = workbook.SheetNames.filter(n => n && n.trim().length > 0);
        if (sheetNames.length === 0) {
            throw new ImportValidationError('INVALID_FILE', 'The workbook must contain at least one sheet.');
        }

        const modules: ImportedModule[] = [];
        const emptySheets: string[] = [];
        const duplicateModules: string[] = [];
        const seenModuleNames = new Set<string>();
        const rowErrors: Array<{ sheet: string; row: number; message: string }> = [];

        for (const sheetName of sheetNames) {
            const moduleName = sheetName.trim();

            // Cross-sheet duplicate module name → reject (two sheets can't map to one module).
            if (seenModuleNames.has(moduleName.toLowerCase())) {
                duplicateModules.push(moduleName);
                continue;
            }
            seenModuleNames.add(moduleName.toLowerCase());

            const sheet = workbook.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', blankrows: false });

            if (rows.length === 0) {
                emptySheets.push(moduleName);
                continue;
            }

            // First row = headers. Build header index → field map.
            const headerRow = (rows[0] as unknown[]).map(normalizeHeader);
            const colIndex: Partial<Record<FieldKey, number>> = {};
            const missingColumns: string[] = [];

            headerRow.forEach((header, idx) => {
                const field = HEADER_ALIASES[header];
                if (field && colIndex[field] === undefined) {
                    colIndex[field] = idx;
                }
            });

            for (const required of REQUIRED_FIELDS) {
                if (colIndex[required] === undefined) {
                    missingColumns.push(prettyField(required));
                }
            }
            if (missingColumns.length > 0) {
                throw new ImportValidationError(
                    'INVALID_COLUMNS',
                    `Sheet "${moduleName}" is missing required column(s): ${missingColumns.join(', ')}.`,
                    { missingColumns },
                );
            }

            // Data rows (skip header).
            const dataRows = rows.slice(1);
            if (dataRows.length === 0) {
                emptySheets.push(moduleName);
                continue;
            }

            const testCases: ImportTestCaseRow[] = [];
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

                // Row-level validation: TC Name, Test Steps, Expected Result are required.
                if (!name) {
                    rowErrors.push({ sheet: moduleName, row: rowNumber, message: 'TC Name is required.' });
                    return;
                }
                if (!stepsRaw) {
                    rowErrors.push({ sheet: moduleName, row: rowNumber, message: 'Test Steps are required.' });
                    return;
                }
                if (!expected) {
                    rowErrors.push({ sheet: moduleName, row: rowNumber, message: 'Expected Results are required.' });
                    return;
                }

                const priorityRaw = get('priority');
                const priority = VALID_PRIORITIES.includes(priorityRaw as TestCasePriority)
                    ? (priorityRaw as TestCasePriority)
                    : normalizePriority(priorityRaw);

                testCases.push({
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
                });
            });

            if (testCases.length === 0) {
                emptySheets.push(moduleName);
                continue;
            }

            modules.push({ module: moduleName, testCases });
        }

        if (emptySheets.length > 0) {
            throw new ImportValidationError(
                'EMPTY_SHEET',
                `Empty module sheet(s) detected: ${emptySheets.join(', ')}. Every sheet must contain at least one test case.`,
                { emptySheets },
            );
        }

        if (duplicateModules.length > 0) {
            throw new ImportValidationError(
                'DUPLICATE_MODULE',
                `Duplicate module name(s) across sheets: ${duplicateModules.join(', ')}. Each sheet must have a unique name.`,
                { duplicateModules },
            );
        }

        if (rowErrors.length > 0) {
            throw new ImportValidationError(
                'ROW_VALIDATION',
                `${rowErrors.length} row(s) failed validation. Fix the issues and re-upload.`,
                { rowErrors },
            );
        }

        // Module conflict check: a module cannot be imported twice for the same project.
        const conflictingModules: string[] = [];
        for (const mod of modules) {
            const existing = await testCaseRepository.getAll({ projectName, module: mod.module });
            if (existing.length > 0) {
                conflictingModules.push(mod.module);
            }
        }
        if (conflictingModules.length > 0) {
            throw new ImportValidationError(
                'MODULE_EXISTS',
                `Test cases already exist for module(s): ${conflictingModules.join(', ')}. Delete the existing module(s) before importing.`,
                { conflictingModules },
            );
        }

        const totalCases = modules.reduce((sum, m) => sum + m.testCases.length, 0);
        logger.info('XLSX import preview built', { projectName, modules: modules.length, totalCases });

        return {
            projectName,
            modules,
            modulesCount: modules.length,
            totalCases,
        };
    },

    /**
     * Persist a validated preview into Test Case Management.
     * Re-checks module conflicts (stateless safety) and saves each module via the repository.
     */
    async saveImport(input: ImportSaveInput): Promise<ImportSaveResult> {
        if (!input.projectName?.trim()) {
            throw new ImportValidationError('INVALID_FILE', 'A project must be selected before saving.');
        }
        if (!input.modules || input.modules.length === 0) {
            throw new ImportValidationError('INVALID_FILE', 'Nothing to save: no modules in the import payload.');
        }

        // Re-check conflicts at save time (the preview may have grown stale).
        const conflictingModules: string[] = [];
        for (const mod of input.modules) {
            const existing = await testCaseRepository.getAll({ projectName: input.projectName, module: mod.module });
            if (existing.length > 0) conflictingModules.push(mod.module);
        }
        if (conflictingModules.length > 0) {
            throw new ImportValidationError(
                'MODULE_EXISTS',
                `Test cases already exist for module(s): ${conflictingModules.join(', ')}. Delete the existing module(s) before importing.`,
                { conflictingModules },
            );
        }

        const saved = [];
        for (const mod of input.modules) {
            // Rows are saved sequentially, so the repository assigns a monotonically increasing
            // sort_order per row → the stored order matches the sheet's module + row order exactly.
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
                    // Preserve the sheet's TC ID (the repo falls back to auto-generation on collision).
                    ...(tc.tcId ? { tcId: tc.tcId } : {}),
                    source: 'imported',
                })),
            });
            saved.push(...result.saved);
        }

        logger.info('XLSX import saved', {
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
    };
    return labels[field];
}
