'use client';

/** Status/priority pills for the Test Case Details page (reuse the shared color config). */
import type { TestCaseStatus, TestCasePriority } from '@/features/test-case-management/types';
import { STATUS_COLOR, STATUS_BG, STATUS_ICON, PRIORITY_COLOR } from './constants';

export function StatusPill({ status, size = 'sm' }: { status: TestCaseStatus; size?: 'sm' | 'md' }) {
    const Icon = STATUS_ICON[status];
    const cls = size === 'md'
        ? 'px-2.5 py-1 text-sm gap-1.5'
        : 'px-2 py-0.5 text-xs gap-1';
    return (
        <span
            className={`inline-flex items-center rounded-md font-medium ${cls}`}
            style={{ background: STATUS_BG[status], color: STATUS_COLOR[status] }}
        >
            <Icon className={size === 'md' ? 'w-3.5 h-3.5' : 'w-3 h-3'} />
            {status}
        </span>
    );
}

export function PriorityTag({ priority }: { priority: TestCasePriority }) {
    const color = PRIORITY_COLOR[priority];
    return (
        <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium"
            style={{ background: `${color}15`, color }}
        >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
            {priority} Priority
        </span>
    );
}
