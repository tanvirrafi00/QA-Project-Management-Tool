'use client';

/**
 * Pagination — shared pagination for every table in the app.
 *
 * Two pieces:
 *   1. `usePagination(items, pageSize?)` — the math (page state, slicing, totals).
 *   2. `<Pagination .../>` — the footer UI (range summary, rows-per-page, prev/next + numbered pages).
 *
 * Mirrors the style previously inlined in `app/test-management/page.tsx` so all
 * tables look and behave identically. Drop the 50/100-row hard caps that silently
 * hid data: every row is reachable via pages.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { CustomSelect } from './CustomSelect';

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export interface PaginationState<T> {
    /** 1-indexed current page (clamped to the valid range). */
    page: number;
    setPage: (page: number) => void;
    pageSize: number;
    setPageSize: (size: number) => void;
    totalItems: number;
    totalPages: number;
    /** Inclusive start index of the current page within the full list. */
    startIdx: number;
    /** Exclusive end index of the current page within the full list. */
    endIdx: number;
    /** The slice of items for the current page. */
    paginatedItems: T[];
}

/**
 * Pagination hook. Pass the already-filtered list; it handles slicing.
 * Changing the page size resets to page 1.
 *
 * `resetKey` (optional): whenever this value changes, the page resets to 1 — pass a
 * string derived from your active filters/search so a narrowed result set starts at the top.
 */
export function usePagination<T>(items: T[], initialPageSize = 10, resetKey?: string, initialPage = 1): PaginationState<T> {
    const [page, setPage] = useState(initialPage);
    const [pageSize, setPageSizeState] = useState(initialPageSize);

    // Reset to page 1 when the resetKey (filters/search) changes — but skip the first run so an
    // explicit `initialPage` (e.g. a page restored from sessionStorage) is honored on mount.
    const firstReset = useRef(true);
    useEffect(() => {
        if (firstReset.current) {
            firstReset.current = false;
            return;
        }
        setPage(1);
    }, [resetKey]);

    const totalItems = items.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const safePage = Math.min(page, totalPages);
    const startIdx = (safePage - 1) * pageSize;
    const endIdx = startIdx + pageSize;
    const paginatedItems = items.slice(startIdx, endIdx);

    const setPageSize = (size: number) => {
        setPageSizeState(size);
        setPage(1);
    };

    return {
        page: safePage,
        setPage,
        pageSize,
        setPageSize,
        totalItems,
        totalPages,
        startIdx,
        endIdx,
        paginatedItems,
    };
}

/** Build a condensed page-number list with ellipses, e.g. [1, '…', 4, 5, 6, '…', 12]. */
function buildPageNumbers(current: number, totalPages: number): (number | string)[] {
    const pages: (number | string)[] = [];
    const maxVisible = 5;
    if (totalPages <= maxVisible) {
        for (let i = 1; i <= totalPages; i++) pages.push(i);
        return pages;
    }
    pages.push(1);
    const left = Math.max(2, current - 1);
    const right = Math.min(totalPages - 1, current + 1);
    if (left > 2) pages.push('…');
    for (let i = left; i <= right; i++) pages.push(i);
    if (right < totalPages - 1) pages.push('…');
    pages.push(totalPages);
    return pages;
}

interface PaginationProps {
    page: number;
    totalPages: number;
    totalItems: number;
    startIdx: number;
    endIdx: number;
    pageSize: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: number) => void;
    /** Optional label appended after the range, e.g. " in Authentication". */
    rangeSuffix?: React.ReactNode;
    /** Hide the rows-per-page selector (e.g. for compact drawers). */
    hidePageSize?: boolean;
}

export function Pagination({
    page,
    totalPages,
    totalItems,
    startIdx,
    endIdx,
    pageSize,
    onPageChange,
    onPageSizeChange,
    rangeSuffix,
    hidePageSize = false,
}: PaginationProps) {
    const pageNumbers = useMemo(() => buildPageNumbers(page, totalPages), [page, totalPages]);

    if (totalItems === 0) return null;

    return (
        <div className="px-4 py-3 bg-[#F8FAFC] border-t border-[#E2E8F0] flex items-center justify-between gap-4 flex-wrap">
            {/* Summary + page size */}
            <div className="flex items-center gap-3 text-sm text-[#64748B]">
                <span>
                    Showing <span className="font-semibold text-[#1E293B]">{startIdx + 1}</span>–
                    <span className="font-semibold text-[#1E293B]">{Math.min(endIdx, totalItems)}</span> of{' '}
                    <span className="font-semibold text-[#1E293B]">{totalItems}</span>
                    {rangeSuffix}
                </span>
                {!hidePageSize && (
                    <div className="flex items-center gap-1.5">
                        <span className="text-xs text-[#94A3B8]">Rows:</span>
                        <div style={{ width: '72px' }}>
                            <CustomSelect
                                options={PAGE_SIZE_OPTIONS.map(n => ({ value: String(n), label: String(n) }))}
                                value={String(pageSize)}
                                onChange={v => onPageSizeChange(Number(v))}
                                height={32}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Page navigation */}
            <div className="flex items-center gap-1">
                <button
                    onClick={() => onPageChange(Math.max(1, page - 1))}
                    disabled={page === 1}
                    className="inline-flex items-center gap-1 px-3 h-8 rounded-lg text-xs font-medium text-[#1E293B] border border-[#E2E8F0] bg-white hover:bg-[#F1F5F9] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    <ChevronLeft className="w-3.5 h-3.5" /> Prev
                </button>
                {pageNumbers.map((p, i) =>
                    typeof p === 'number' ? (
                        <button
                            key={i}
                            onClick={() => onPageChange(p)}
                            className={`min-w-[2rem] h-8 px-2 rounded-lg text-xs font-medium transition-colors ${p === page ? 'bg-[#06B6D4] text-white' : 'text-[#1E293B] border border-[#E2E8F0] bg-white hover:bg-[#F1F5F9]'}`}
                        >
                            {p}
                        </button>
                    ) : (
                        <span key={i} className="px-1 text-xs text-[#94A3B8]">{p}</span>
                    )
                )}
                <button
                    onClick={() => onPageChange(Math.min(totalPages, page + 1))}
                    disabled={page === totalPages}
                    className="inline-flex items-center gap-1 px-3 h-8 rounded-lg text-xs font-medium text-[#1E293B] border border-[#E2E8F0] bg-white hover:bg-[#F1F5F9] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    Next <ChevronRight className="w-3.5 h-3.5" />
                </button>
            </div>
        </div>
    );
}
