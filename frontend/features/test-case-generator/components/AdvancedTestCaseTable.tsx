'use client';

/**
 * AdvancedTestCaseTable — the SINGLE shared 12-column test-case table for the whole portal.
 *
 * Used by the generator results view AND Test Management (and anywhere else test cases are listed),
 * so every test-case view shows the identical columns: Module · TC ID · TC Name · Priority · Test
 * Steps · Expected Results · Test Status · Actual Result · Assigned To · Execution Date · Related
 * Bugs · Comments. Features: sticky header, horizontal scroll, per-column hide/show (none hidden by
 * default), clickable rows → details.
 *
 * Field-tolerant: accepts both the generator's `TestCase` shape (`id`, `steps`, `scenario`) and the
 * persisted repository shape (`tcId`, `testSteps`, `name`) without mapping. An optional `actions`
 * render-prop adds a trailing Actions column for editable contexts (e.g. Test Management).
 */

import { useState } from 'react';

/** Union of the fields used by either test-case shape (generator or persisted). Fields are null- and
 *  undefined-tolerant so BOTH shapes (persisted `| null`, generator `| undefined`) are assignable. */
export interface TestCaseRow {
    id?: string;
    tcId?: string;
    module?: string | null;
    subModule?: string | null;
    name?: string | null;
    scenario?: string;
    type?: string | null;
    priority?: string | null;
    steps?: string[] | null;
    testSteps?: string[] | null;
    expectedResult?: string | null;
    testStatus?: string | null;
    actualResult?: string | null;
    assignedTo?: string | null;
    executionDate?: string | null;
    relatedBugs?: string | string[] | null;
    comments?: string | null;
}

export interface ColumnDef {
    key: string;
    label: string;
    width: number;
    render: (tc: TestCaseRow) => React.ReactNode;
}

const PRIORITY_STYLE: Record<string, string> = {
    Critical: 'bg-[#FEF2F2] text-[#DC2626]',
    High: 'bg-[#FFF7ED] text-[#EA580C]',
    Medium: 'bg-[#FEFCE8] text-[#F59E0B]',
    Low: 'bg-[#F0FDF4] text-[#16A34A]',
};

const STATUS_STYLE: Record<string, string> = {
    'Not Executed': 'bg-[#F1F5F9] text-[#64748B]',
    Passed: 'bg-[#ECFDF5] text-[#059669]',
    Failed: 'bg-[#FEF2F2] text-[#DC2626]',
    Blocked: 'bg-[#FFF7ED] text-[#EA580C]',
    Skipped: 'bg-[#F5F3FF] text-[#8B5CF6]',
};

function Badge({ text, className }: { text: string; className: string }) {
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${className}`}>
            {text}
        </span>
    );
}

/** Field-tolerant accessors (work for both generator + persisted shapes). */
const tcId = (tc: TestCaseRow) => tc.id || tc.tcId || '—';
const tcName = (tc: TestCaseRow) => tc.name || tc.scenario || '—';
const tcSteps = (tc: TestCaseRow) => tc.steps || tc.testSteps || [];
const tcRelatedBugs = (tc: TestCaseRow) => {
    const v = tc.relatedBugs;
    if (!v) return 'N/A';
    return Array.isArray(v) ? (v.length > 0 ? v.join(', ') : 'N/A') : v;
};
const fmtDate = (v?: string | null) => {
    if (!v) return '—';
    const d = new Date(String(v).replace(' ', 'T'));
    return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString();
};

export const TEST_CASE_COLUMNS: ColumnDef[] = [
    { key: 'module', label: 'Module', width: 140, render: (tc) => tc.module || 'General' },
    { key: 'id', label: 'TC ID', width: 110, render: (tc) => <span className="font-mono text-[#06B6D4] font-medium">{tcId(tc)}</span> },
    { key: 'name', label: 'TC Name', width: 280, render: (tc) => <span className="font-medium text-[#0F172A]">{tcName(tc)}</span> },
    {
        key: 'priority', label: 'Priority', width: 110,
        render: (tc) => <Badge text={tc.priority || 'Medium'} className={PRIORITY_STYLE[tc.priority || ''] ?? 'bg-[#F1F5F9] text-[#64748B]'} />,
    },
    {
        key: 'steps', label: 'Test Steps', width: 320,
        render: (tc) => (
            <ol className="list-decimal pl-4 space-y-0.5 text-[#475569]">
                {tcSteps(tc).map((s, i) => <li key={i} className="leading-snug">{s}</li>)}
            </ol>
        ),
    },
    { key: 'expectedResult', label: 'Expected Results', width: 260, render: (tc) => <span className="text-[#475569]">{tc.expectedResult || '—'}</span> },
    {
        key: 'testStatus', label: 'Test Status', width: 130,
        render: (tc) => <Badge text={tc.testStatus || 'Not Executed'} className={STATUS_STYLE[tc.testStatus || ''] ?? 'bg-[#F1F5F9] text-[#64748B]'} />,
    },
    { key: 'actualResult', label: 'Actual Result', width: 160, render: (tc) => <span className="text-[#475569]">{tc.actualResult || 'N/A'}</span> },
    { key: 'assignedTo', label: 'Assigned To', width: 140, render: (tc) => <span className="text-[#475569]">{tc.assignedTo || 'Unassigned'}</span> },
    { key: 'executionDate', label: 'Execution Date', width: 140, render: (tc) => <span className="text-[#475569]">{fmtDate(tc.executionDate)}</span> },
    { key: 'relatedBugs', label: 'Related Bugs', width: 130, render: (tc) => <span className="text-[#475569]">{tcRelatedBugs(tc)}</span> },
    { key: 'comments', label: 'Comments', width: 200, render: (tc) => <span className="text-[#475569]">{tc.comments || 'N/A'}</span> },
];

interface AdvancedTestCaseTableProps<T extends TestCaseRow> {
    testCases: T[];
    onRowClick?: (tc: T) => void;
    /** Optional trailing Actions column (e.g. inline edit / quick-status) for editable contexts. */
    actions?: (tc: T) => React.ReactNode;
    /**
     * Optional per-column render overrides for editable contexts (e.g. Test Management inline cells).
     * Keyed by column key ('priority' | 'testStatus' | 'assignedTo' | …). When present for a column it
     * replaces the default read-only render for that column only. Omit (e.g. generator preview) for
     * fully read-only display.
     */
    editableCells?: Partial<Record<string, (tc: T) => React.ReactNode>>;
    emptyMessage?: string;
}

/** Generic: each caller keeps its own row type (generator `TestCase` or persisted `TestCase`). */
export function AdvancedTestCaseTable<T extends TestCaseRow>({
    testCases,
    onRowClick,
    actions,
    editableCells,
    emptyMessage,
}: AdvancedTestCaseTableProps<T>) {
    const [hidden, setHidden] = useState<Set<string>>(new Set());

    const toggle = (key: string) =>
        setHidden((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });

    const visibleColumns = TEST_CASE_COLUMNS.filter((c) => !hidden.has(c.key));
    const totalWidth = visibleColumns.reduce((sum, c) => sum + c.width, 0) + (actions ? 140 : 0);

    return (
        <div className="flex flex-col" style={{ gap: '12px' }}>
            {/* Column hide/show toolbar (none hidden by default) */}
            <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">Columns:</span>
                {TEST_CASE_COLUMNS.map((col) => {
                    const isHidden = hidden.has(col.key);
                    return (
                        <button
                            key={col.key}
                            type="button"
                            onClick={() => toggle(col.key)}
                            className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                                isHidden
                                    ? 'bg-white text-[#94A3B8] border-[#E2E8F0] line-through'
                                    : 'bg-[#ECFEFF] text-[#0E7490] border-[#A5F3FC]'
                            }`}
                        >
                            {col.label}
                        </button>
                    );
                })}
                {hidden.size > 0 && (
                    <button
                        type="button"
                        onClick={() => setHidden(new Set())}
                        className="px-2.5 py-1 rounded-md text-xs font-medium text-[#06B6D4] hover:underline"
                    >
                        Show all
                    </button>
                )}
            </div>

            {/* Table — sticky header + horizontal scroll */}
            <div className="bg-white rounded-2xl border border-[#E2E8F0] overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="border-collapse" style={{ minWidth: `${totalWidth}px` }}>
                        <thead>
                            <tr className="bg-[#F8FAFC]">
                                {visibleColumns.map((col) => (
                                    <th
                                        key={col.key}
                                        className="sticky top-0 z-10 bg-[#F8FAFC] text-left px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wider border-b border-[#E2E8F0] whitespace-nowrap"
                                        style={{ width: `${col.width}px`, minWidth: `${col.width}px` }}
                                    >
                                        {col.label}
                                    </th>
                                ))}
                                {actions && (
                                    <th
                                        className="sticky top-0 z-10 bg-[#F8FAFC] text-right px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wider border-b border-[#E2E8F0] whitespace-nowrap"
                                        style={{ width: '140px', minWidth: '140px' }}
                                    >
                                        Actions
                                    </th>
                                )}
                            </tr>
                        </thead>
                        <tbody>
                            {testCases.length === 0 ? (
                                <tr>
                                    <td colSpan={visibleColumns.length + (actions ? 1 : 0)} className="px-4 py-12 text-center text-sm text-[#94A3B8]">
                                        {emptyMessage || 'No test cases in this view.'}
                                    </td>
                                </tr>
                            ) : (
                                testCases.map((tc) => (
                                    <tr
                                        key={tcId(tc) + (tc.name || '')}
                                        onClick={() => onRowClick?.(tc)}
                                        className="border-b border-[#F1F5F9] last:border-0 hover:bg-[#F8FAFC] transition-colors align-top cursor-pointer"
                                    >
                                        {visibleColumns.map((col) => (
                                            <td key={col.key} className="px-4 py-2.5 text-sm text-[#1E293B] border-r border-[#F8FAFC] last:border-0">
                                                {editableCells?.[col.key]?.(tc) ?? col.render(tc)}
                                            </td>
                                        ))}
                                        {actions && (
                                            <td className="px-4 py-2.5 text-right border-l border-[#F8FAFC]" onClick={(e) => e.stopPropagation()}>
                                                {actions(tc)}
                                            </td>
                                        )}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
