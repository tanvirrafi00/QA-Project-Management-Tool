/**
 * Bug XLSX Import Service
 *
 * Business logic for the Excel bug import (single sheet = a flat list of bugs):
 *   1. Parse the workbook with `xlsx`.
 *   2. Validate file/sheet/row structure (strict all-or-nothing).
 *   3. Check duplicate Bug IDs — within the file and against the project.
 *   4. Return a preview (no persistence) — the user confirms before `saveImport`.
 *
 * Stateless two-phase model (mirrors test-case-import.service.ts): the preview is held client-side
 * through review and `saveImport` re-validates before persisting. Persistence reuses the existing
 * `bugRepository.save()` — the same path manual/AI bugs take — so dashboard analytics stay correct
 * automatically (reporting-rules.md "one place" rule).
 *
 * Lives in the service layer (architecture-guidelines.md §3): HTTP stays in the controller,
 * persistence stays in the repository. This service only orchestrates parsing + validation +
 * repository calls, so it stays migration-safe (database-planning.md §8).
 */

import * as XLSX from 'xlsx';
import {
    Bug,
    BugImportPreview,
    BugImportRow,
    BugImportSaveInput,
    BugImportSaveResult,
    BugPriority,
    BugSeverity,
    BugStatus,
    BugImportValidationError,
} from '../types';
import bugRepository from '../repositories/bug.repository';
import logger from '../../../shared/logger';

// ── Column mapping ─────────────────────────────────────

/** Canonical field keys we map Excel headers onto. */
type FieldKey =
    | 'bugId'
    | 'module'
    | 'title'
    | 'severity'
    | 'priority'
    | 'description'
    | 'stepsToReproduce'
    | 'expectedResult'
    | 'actualResult'
    | 'impact'
    | 'status'
    | 'assignee';

/** Normalized header text → canonical field. Keys are lowercased, alphanumeric-only. */
const HEADER_ALIASES: Record<string, FieldKey> = {
    bugid: 'bugId',
    id: 'bugId',
    bugno: 'bugId',
    module: 'module',
    area: 'module',
    title: 'title',
    summary: 'title',
    titlesummary: 'title',
    name: 'title',
    severity: 'severity',
    priority: 'priority',
    description: 'description',
    stepstoreproduce: 'stepsToReproduce',
    steps: 'stepsToReproduce',
    reproductionsteps: 'stepsToReproduce',
    expectedresult: 'expectedResult',
    expected: 'expectedResult',
    actualresult: 'actualResult',
    actual: 'actualResult',
    bugimpactarea: 'impact',
    impact: 'impact',
    impactarea: 'impact',
    status: 'status',
    assignedto: 'assignee',
    assignee: 'assignee',
    owner: 'assignee',
};

/** Headers that MUST be present in the sheet. */
const REQUIRED_FIELDS: FieldKey[] = ['title', 'module'];

const VALID_SEVERITIES: BugSeverity[] = ['Critical', 'High', 'Medium', 'Low'];
const VALID_PRIORITIES: BugPriority[] = ['P1', 'P2', 'P3', 'P4'];
const VALID_STATUSES: BugStatus[] = [
    'Open', 'Assigned', 'In Progress', 'Fixed', 'Ready For QA', 'Verified', 'Closed', 'Reopened',
];

/** Max file size accepted by the parser (mirrors the multer limit). */
export const MAX_IMPORT_SIZE_BYTES = 10 * 1024 * 1024;
/** Max data rows accepted in a single import. */
export const MAX_IMPORT_ROWS = 1000;

/** Characters that begin a spreadsheet formula — reject to prevent formula injection. */
const FORMULA_PREFIXES = /^[=+\-@]/;

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

/** Split a multi-line steps cell into a clean step array. */
function splitSteps(raw: string): string[] {
    return raw
        .split(/\r?\n|\r/)
        .map(s => s.trim())
        .filter(s => s.length > 0);
}

/** Normalize a severity string to the canonical enum. Returns null when unrecognized (non-empty). */
function normalizeSeverity(raw: string): BugSeverity | null {
    const s = raw.toLowerCase().trim();
    if (!s) return 'Medium'; // empty → default
    if (s.includes('crit') || s === 's1' || s === 'p0') return 'Critical';
    if (s.includes('high') || s === 's2' || s === 'p1') return 'High';
    if (s.includes('low') || s === 's4' || s === 'p3') return 'Low';
    if (s.includes('med') || s === 's3' || s === 'p2') return 'Medium';
    return null;
}

/** Normalize a priority string to the canonical P1–P4 enum. Returns null when unrecognized. */
function normalizePriority(raw: string): BugPriority | null {
    const s = raw.toLowerCase().trim();
    if (!s) return 'P3'; // empty → default
    if (s === 'p1' || s === 'critical' || s === 'urgent') return 'P1';
    if (s === 'p2' || s === 'high') return 'P2';
    if (s === 'p4' || s === 'low') return 'P4';
    if (s === 'p3' || s.includes('med') || s === 'normal') return 'P3';
    return null;
}

/** Normalize a status string to the canonical BugStatus enum. Returns null when unrecognized. */
function normalizeStatus(raw: string): BugStatus | null {
    const s = raw.toLowerCase().trim();
    if (!s) return 'Open'; // empty → default
    if (s === 'open' || s === 'new') return 'Open';
    if (s.startsWith('assign')) return 'Assigned';
    if (s.includes('progress') || s === 'wip') return 'In Progress';
    if (s.startsWith('fixed') || s.startsWith('resolved') || s.startsWith('done')) return 'Fixed';
    if (s.includes('ready') && s.includes('qa')) return 'Ready For QA';
    if (s.startsWith('verif')) return 'Verified';
    if (s.startsWith('close')) return 'Closed';
    if (s.startsWith('reopen')) return 'Reopened';
    return null;
}

/** Reject cells that begin with a formula character (CSV/formula injection guard). */
function hasFormulaInjection(value: string): boolean {
    return FORMULA_PREFIXES.test(value);
}

export const bugImportService = {
    /**
     * Parse + validate an XLSX buffer and check Bug ID conflicts. Does NOT persist.
     * Throws `BugImportValidationError` (structured) on any validation failure (all-or-nothing).
     */
    async parseAndValidate(buffer: Buffer | ArrayBuffer, projectName: string): Promise<BugImportPreview> {
        if (!projectName?.trim()) {
            throw new BugImportValidationError('INVALID_FILE', 'A project must be selected before importing.');
        }

        let workbook: XLSX.WorkBook;
        try {
            workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
        } catch (err) {
            logger.error('Bug XLSX import: failed to parse workbook', { message: (err as Error).message });
            throw new BugImportValidationError('PARSE_ERROR', 'The file is corrupted or is not a valid .xlsx workbook.');
        }

        const sheetNames = workbook.SheetNames.filter(n => n && n.trim().length > 0);
        if (sheetNames.length === 0) {
            throw new BugImportValidationError('INVALID_FILE', 'The workbook must contain at least one sheet.');
        }

        const sheetName = sheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', blankrows: false });

        if (rows.length === 0) {
            throw new BugImportValidationError('EMPTY_SHEET', `Sheet "${sheetName}" is empty.`);
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
            throw new BugImportValidationError(
                'INVALID_COLUMNS',
                `Missing required column(s): ${missingColumns.join(', ')}.`,
                { missingColumns },
            );
        }

        // Data rows (skip header).
        const dataRows = rows.slice(1);
        if (dataRows.length === 0) {
            throw new BugImportValidationError('EMPTY_SHEET', `Sheet "${sheetName}" has no data rows.`);
        }

        if (dataRows.length > MAX_IMPORT_ROWS) {
            throw new BugImportValidationError(
                'TOO_MANY_ROWS',
                `Too many rows (${dataRows.length}). Maximum allowed is ${MAX_IMPORT_ROWS}.`,
            );
        }

        const bugs: BugImportRow[] = [];
        const rowErrors: Array<{ row: number; message: string }> = [];
        const seenBugIds = new Set<string>();
        const duplicateBugIds: string[] = [];

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

            const bugIdRaw = get('bugId');
            const module = get('module');
            const title = get('title');
            const severityRaw = get('severity');
            const priorityRaw = get('priority');
            const statusRaw = get('status');

            // Formula-injection guard across every mapped cell.
            const mappedValues = [bugIdRaw, module, title, severityRaw, priorityRaw, statusRaw,
                get('description'), get('stepsToReproduce'), get('expectedResult'),
                get('actualResult'), get('impact'), get('assignee')];
            const injected = mappedValues.find(hasFormulaInjection);
            if (injected !== undefined) {
                rowErrors.push({ row: rowNumber, message: 'A cell begins with a formula character (=, +, -, @) which is not allowed.' });
                return;
            }

            // Row-level required-field validation.
            if (!title) {
                rowErrors.push({ row: rowNumber, message: 'Title is required.' });
                return;
            }
            if (!module) {
                rowErrors.push({ row: rowNumber, message: 'Module is required.' });
                return;
            }

            // Enum validation (empty → default; non-empty + unrecognized → error).
            const severity = severityRaw ? normalizeSeverity(severityRaw) : 'Medium';
            if (severity === null) {
                rowErrors.push({ row: rowNumber, message: `Invalid Severity value: "${severityRaw}". Valid: ${VALID_SEVERITIES.join(', ')}.` });
                return;
            }
            const priority = priorityRaw ? normalizePriority(priorityRaw) : 'P3';
            if (priority === null) {
                rowErrors.push({ row: rowNumber, message: `Invalid Priority value: "${priorityRaw}". Valid: ${VALID_PRIORITIES.join(', ')}.` });
                return;
            }
            const status = statusRaw ? normalizeStatus(statusRaw) : 'Open';
            if (status === null) {
                rowErrors.push({ row: rowNumber, message: `Invalid Status value: "${statusRaw}". Valid: ${VALID_STATUSES.join(', ')}.` });
                return;
            }

            // Duplicate Bug ID within the file (only non-empty IDs are checked).
            if (bugIdRaw) {
                if (seenBugIds.has(bugIdRaw)) {
                    duplicateBugIds.push(bugIdRaw);
                } else {
                    seenBugIds.add(bugIdRaw);
                }
            }

            bugs.push({
                bugId: bugIdRaw,
                module,
                title,
                severity,
                priority,
                description: get('description'),
                stepsToReproduce: splitSteps(get('stepsToReproduce')),
                expectedResult: get('expectedResult'),
                actualResult: get('actualResult'),
                impact: get('impact'),
                status,
                assignee: get('assignee') || 'Unassigned',
            });
        });

        // Surface row errors BEFORE the empty check: a file whose only rows all failed validation
        // (bad enum, formula injection, …) would otherwise report a misleading "empty sheet".
        if (rowErrors.length > 0) {
            throw new BugImportValidationError(
                'ROW_VALIDATION',
                `${rowErrors.length} row(s) failed validation. Fix the issues and re-upload.`,
                { rowErrors },
            );
        }

        if (duplicateBugIds.length > 0) {
            throw new BugImportValidationError(
                'DUPLICATE_BUG_ID',
                `Duplicate Bug ID(s) within the file: ${[...new Set(duplicateBugIds)].join(', ')}.`,
                { duplicateBugIds: [...new Set(duplicateBugIds)] },
            );
        }

        if (bugs.length === 0) {
            throw new BugImportValidationError('EMPTY_SHEET', 'No valid bug rows found (all rows were blank).');
        }

        // Bug ID conflict check: an incoming ID must not already exist in the project.
        const existing = await bugRepository.getAll({ projectName });
        const existingBugIds = new Set(existing.map(b => b.bugId));
        const conflicting: string[] = bugs
            .filter(b => b.bugId && existingBugIds.has(b.bugId))
            .map(b => b.bugId);
        if (conflicting.length > 0) {
            throw new BugImportValidationError(
                'BUG_ID_EXISTS',
                `Bug ID(s) already exist in this project: ${conflicting.join(', ')}.`,
                { existingBugIds: conflicting },
            );
        }

        logger.info('Bug XLSX import preview built', { projectName, totalBugs: bugs.length });

        return {
            projectName,
            bugs,
            totalBugs: bugs.length,
        };
    },

    /**
     * Persist a validated preview into Bug Management.
     * Re-checks Bug ID conflicts (stateless safety) and saves each row via the repository — the same
     * `save()` path manual/AI bugs use, so analytics stay correct automatically.
     */
    async saveImport(input: BugImportSaveInput): Promise<BugImportSaveResult> {
        if (!input.projectName?.trim()) {
            throw new BugImportValidationError('INVALID_FILE', 'A project must be selected before saving.');
        }
        if (!input.bugs || !Array.isArray(input.bugs) || input.bugs.length === 0) {
            throw new BugImportValidationError('INVALID_FILE', 'Nothing to save: no bugs in the import payload.');
        }

        // Re-check conflicts at save time (the preview may have grown stale).
        const existing = await bugRepository.getAll({ projectName: input.projectName });
        const existingBugIds = new Set(existing.map(b => b.bugId));
        const conflicting = input.bugs
            .filter(b => b.bugId && existingBugIds.has(b.bugId))
            .map(b => b.bugId);
        if (conflicting.length > 0) {
            throw new BugImportValidationError(
                'BUG_ID_EXISTS',
                `Bug ID(s) already exist in this project: ${conflicting.join(', ')}.`,
                { existingBugIds: conflicting },
            );
        }

        const saved: Bug[] = [];
        for (const row of input.bugs) {
            const bug = await bugRepository.save({
                bugId: row.bugId || bugRepository.generateBugId(),
                projectName: input.projectName,
                layer: 'Frontend',
                title: row.title,
                description: row.description,
                module: row.module,
                severity: row.severity,
                priority: row.priority,
                status: row.status,
                precondition: '',
                stepsToReproduce: row.stepsToReproduce,
                expectedResult: row.expectedResult,
                actualResult: row.actualResult,
                impact: row.impact,
                reporter: 'Imported',
                assignee: row.assignee,
                tags: [],
            });
            saved.push(bug);
        }

        logger.info('Bug XLSX import saved', {
            projectName: input.projectName,
            saved: saved.length,
        });

        return { saved, total: saved.length };
    },
};

/** Human-readable label for a canonical field (used in "missing column" messages). */
function prettyField(field: FieldKey): string {
    const labels: Record<FieldKey, string> = {
        bugId: 'Bug ID',
        module: 'Module',
        title: 'Title',
        severity: 'Severity',
        priority: 'Priority',
        description: 'Description',
        stepsToReproduce: 'Steps to Reproduce',
        expectedResult: 'Expected Result',
        actualResult: 'Actual Result',
        impact: 'Bug Impact Area',
        status: 'Status',
        assignee: 'Assigned To',
    };
    return labels[field];
}
