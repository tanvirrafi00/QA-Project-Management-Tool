/**
 * Bug Paste Parser Service
 *
 * Business logic for parsing pasted table data (Markdown, TSV, Excel, Google Sheets)
 * for quick bug addition. Mirrors the Excel import service but accepts text paste.
 *
 * Lives in the service layer (architecture-guidelines.md §3): HTTP stays in the controller,
 * parsing/validation logic is here, persistence is in the repository.
 */

import {
    Bug,
    BugPastePreview,
    BugPasteRow,
    BugPasteSaveInput,
    BugPasteSaveResult,
    BugPriority,
    BugSeverity,
    BugStatus,
    BugPasteValidationError,
} from '../types';
import bugRepository from '../repositories/bug.repository';
import logger from '../../../shared/logger';

// ── Column mapping ─────────────────────────────────────

/** Canonical field keys we map pasted headers onto. */
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

/** Fixed column order for header-less parsing. All fields are optional except title and module. */
const FIXED_COLUMN_ORDER: FieldKey[] = [
    'bugId',
    'module',
    'title',
    'severity',
    'priority',
    'description',
    'stepsToReproduce',
    'expectedResult',
    'actualResult',
    'impact',
    'status',
    'assignee'
];

/** Headers that MUST be present in the pasted table when using header-based parsing. */
const REQUIRED_FIELDS: FieldKey[] = ['title', 'module'];

const VALID_SEVERITIES: BugSeverity[] = ['Critical', 'High', 'Medium', 'Low'];
const VALID_PRIORITIES: BugPriority[] = ['P1', 'P2', 'P3', 'P4'];
const VALID_STATUSES: BugStatus[] = [
    'Open', 'Assigned', 'In Progress', 'Fixed', 'Ready For QA', 'Verified', 'Closed', 'Reopened',
];

/** Max rows accepted in a single paste. */
export const MAX_PASTE_ROWS = 1000;

/** Characters that begin a spreadsheet formula — reject to prevent formula injection. */
const FORMULA_PREFIXES = /^[=+\-@]/;

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
    if (!s) return 'Medium';
    if (s.includes('crit') || s === 's1' || s === 'p0') return 'Critical';
    if (s.includes('high') || s === 's2' || s === 'p1') return 'High';
    if (s.includes('low') || s === 's4' || s === 'p3') return 'Low';
    if (s.includes('med') || s === 's3' || s === 'p2') return 'Medium';
    return null;
}

/** Normalize a priority string to the canonical P1–P4 enum. Returns null when unrecognized. */
function normalizePriority(raw: string): BugPriority | null {
    const s = raw.toLowerCase().trim();
    if (!s) return 'P3';
    if (s === 'p1' || s === 'critical' || s === 'urgent') return 'P1';
    if (s === 'p2' || s === 'high') return 'P2';
    if (s === 'p4' || s === 'low') return 'P4';
    if (s === 'p3' || s.includes('med') || s === 'normal') return 'P3';
    return null;
}

/** Normalize a status string to the canonical BugStatus enum. Returns null when unrecognized. */
function normalizeStatus(raw: string): BugStatus | null {
    const s = raw.toLowerCase().trim();
    if (!s) return 'Open';
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

export const bugPasteService = {
    /**
     * Parse + validate pasted bug table. Does NOT persist.
     * Throws `BugPasteValidationError` on any validation failure.
     */
    async parseAndValidate(text: string, projectName: string): Promise<BugPastePreview> {
        if (!projectName?.trim()) {
            throw new BugPasteValidationError('INVALID_FILE', 'A project must be selected before pasting.');
        }

        if (!text?.trim()) {
            throw new BugPasteValidationError('EMPTY_PASTE', 'Please paste some data.');
        }

        // Parse the pasted text into a table
        const table = parsePastedTable(text);

        if (table.length === 0) {
            throw new BugPasteValidationError('INVALID_FORMAT', 'Could not parse the pasted data. Please ensure it is a valid table format.');
        }

        // Check if first row contains headers (optional header detection)
        const firstRow = table[0].map(normalizeHeader);
        const hasHeaders = firstRow.some(header => HEADER_ALIASES[header] !== undefined);

        // Use header-based parsing if headers are detected, otherwise use fixed column order
        const dataRows = hasHeaders ? table.slice(1) : table;
        const colIndex: Partial<Record<FieldKey, number>> = {};

        if (hasHeaders) {
            // Header-based mapping
            firstRow.forEach((header, idx) => {
                const field = HEADER_ALIASES[header];
                if (field && colIndex[field] === undefined) {
                    colIndex[field] = idx;
                }
            });
        } else {
            // Fixed column order mapping
            FIXED_COLUMN_ORDER.forEach((field, idx) => {
                colIndex[field] = idx;
            });
        }

        // For header-based parsing, validate required fields
        if (hasHeaders) {
            const missingColumns: string[] = [];
            for (const required of REQUIRED_FIELDS) {
                if (colIndex[required] === undefined) {
                    missingColumns.push(prettyField(required));
                }
            }
            if (missingColumns.length > 0) {
                throw new BugPasteValidationError(
                    'INVALID_COLUMNS',
                    `Missing required column(s): ${missingColumns.join(', ')}.`,
                    { missingColumns },
                );
            }
        }
        if (dataRows.length === 0) {
            throw new BugPasteValidationError('EMPTY_PASTE', 'No data rows found in the pasted table.');
        }

        if (dataRows.length > MAX_PASTE_ROWS) {
            throw new BugPasteValidationError(
                'TOO_MANY_ROWS',
                `Too many rows (${dataRows.length}). Maximum allowed is ${MAX_PASTE_ROWS}.`,
            );
        }

        const bugs: BugPasteRow[] = [];
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
        // (bad enum, formula injection, …) would otherwise report a misleading "empty paste".
        if (rowErrors.length > 0) {
            throw new BugPasteValidationError(
                'ROW_VALIDATION',
                `${rowErrors.length} row(s) failed validation. Fix the issues and try again.`,
                { rowErrors },
            );
        }

        if (duplicateBugIds.length > 0) {
            throw new BugPasteValidationError(
                'DUPLICATE_BUG_ID',
                `Duplicate Bug ID(s) within the paste: ${[...new Set(duplicateBugIds)].join(', ')}.`,
                { duplicateBugIds: [...new Set(duplicateBugIds)] },
            );
        }

        if (bugs.length === 0) {
            throw new BugPasteValidationError('EMPTY_PASTE', 'No valid bug rows found (all rows were blank).');
        }

        // Bug ID conflict check: an incoming ID must not already exist in the project.
        const existing = await bugRepository.getAll({ projectName });
        const existingBugIds = new Set(existing.map(b => b.bugId));
        const conflicting: string[] = bugs
            .filter(b => b.bugId && existingBugIds.has(b.bugId))
            .map(b => b.bugId);
        if (conflicting.length > 0) {
            throw new BugPasteValidationError(
                'BUG_ID_EXISTS',
                `Bug ID(s) already exist in this project: ${conflicting.join(', ')}.`,
                { existingBugIds: conflicting },
            );
        }

        logger.info('Bug paste preview built', { projectName, totalBugs: bugs.length });

        return {
            projectName,
            bugs,
            totalBugs: bugs.length,
        };
    },

    /**
     * Persist a validated preview into Bug Management.
     * Re-checks Bug ID conflicts (stateless safety) and saves each row via the repository.
     */
    async savePaste(input: BugPasteSaveInput): Promise<BugPasteSaveResult> {
        if (!input.projectName?.trim()) {
            throw new BugPasteValidationError('INVALID_FILE', 'A project must be selected before saving.');
        }
        if (!input.bugs || !Array.isArray(input.bugs) || input.bugs.length === 0) {
            throw new BugPasteValidationError('INVALID_FILE', 'Nothing to save: no bugs in the paste payload.');
        }

        // Re-check conflicts at save time (the preview may have grown stale).
        const existing = await bugRepository.getAll({ projectName: input.projectName });
        const existingBugIds = new Set(existing.map(b => b.bugId));
        const conflicting = input.bugs
            .filter(b => b.bugId && existingBugIds.has(b.bugId))
            .map(b => b.bugId);
        if (conflicting.length > 0) {
            throw new BugPasteValidationError(
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
                module: row.module || 'Unknown',
                severity: row.severity,
                priority: row.priority,
                status: row.status,
                precondition: '',
                stepsToReproduce: row.stepsToReproduce,
                expectedResult: row.expectedResult,
                actualResult: row.actualResult,
                impact: row.impact,
                reporter: 'Pasted',
                assignee: row.assignee,
                tags: [],
            });
            saved.push(bug);
        }

        logger.info('Bug paste saved', {
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
