/**
 * Shared status/priority config for the Test Case Details page.
 *
 * Single source of truth for the colors/options used by the header, summary cards,
 * sections, edit/execute modals, and quick-status select — mirrors the values the old
 * drawer + list page used (docs/ui-standards.md §4 color tokens).
 */
import { CheckCircle, XCircle, Ban, SkipForward, Circle, type LucideIcon } from 'lucide-react';
import type { TestCaseStatus, TestCasePriority } from '@/features/test-case-management/types';

export const STATUS_OPTIONS: TestCaseStatus[] = [
    'Not Executed', 'Passed', 'Failed', 'Blocked', 'Skipped',
];
export const PRIORITY_OPTIONS: TestCasePriority[] = ['Critical', 'High', 'Medium', 'Low'];

export const STATUS_COLOR: Record<TestCaseStatus, string> = {
    'Passed': '#22C55E',
    'Failed': '#EF4444',
    'Blocked': '#F97316',
    'Skipped': '#64748B',
    'Not Executed': '#94A3B8',
};

export const STATUS_BG: Record<TestCaseStatus, string> = {
    'Passed': '#F0FDF4',
    'Failed': '#FEF2F2',
    'Blocked': '#FFF7ED',
    'Skipped': '#F8FAFC',
    'Not Executed': '#F1F5F9',
};

export const STATUS_ICON: Record<TestCaseStatus, LucideIcon> = {
    'Passed': CheckCircle,
    'Failed': XCircle,
    'Blocked': Ban,
    'Skipped': SkipForward,
    'Not Executed': Circle,
};

export const PRIORITY_COLOR: Record<TestCasePriority, string> = {
    Critical: '#EF4444',
    High: '#F97316',
    Medium: '#F59E0B',
    Low: '#22C55E',
};

export function statusConfig(status: TestCaseStatus) {
    return { color: STATUS_COLOR[status], bg: STATUS_BG[status], Icon: STATUS_ICON[status] };
}

/** Date helpers shared across the details sections. */
export function formatDate(iso?: string | null): string {
    if (!iso) return '—';
    const d = new Date(String(iso).replace(' ', 'T'));
    return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
    });
}

export function formatDateTime(iso?: string | null): string {
    if (!iso) return '—';
    const d = new Date(String(iso).replace(' ', 'T'));
    return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

export function titleCase(value: string): string {
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}
