/**
 * Bug severity / status / priority badges.
 *
 * Color maps mirror the ones historically inlined in `BugDetailDrawer.tsx` so imported, manual, and
 * AI-generated bugs read identically everywhere. Extracted here so the Import preview, the Bug List,
 * and the future Bug Details page all share one source (docs/ui-standards.md — reuse before rebuild).
 */

import type { BugSeverity, BugStatus, BugPriority } from '../types';

const SEVERITY_COLORS: Record<BugSeverity, string> = {
    Critical: '#EF4444',
    High: '#F97316',
    Medium: '#F59E0B',
    Low: '#22C55E',
};

const STATUS_COLORS: Record<BugStatus, string> = {
    Open: '#3B82F6',
    Assigned: '#8B5CF6',
    'In Progress': '#F59E0B',
    Fixed: '#22C55E',
    'Ready For QA': '#06B6D4',
    Verified: '#10B981',
    Closed: '#64748B',
    Reopened: '#EF4444',
};

const PRIORITY_COLORS: Record<BugPriority, string> = {
    P1: '#EF4444',
    P2: '#F97316',
    P3: '#F59E0B',
    P4: '#22C55E',
};

/** Colored pill: colored text on a 12%-alpha tint of the same color. */
function ColoredBadge({ value, color }: { value: string; color: string }) {
    return (
        <span
            className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold whitespace-nowrap"
            style={{ color, backgroundColor: `${color}1F`, border: `1px solid ${color}33` }}
        >
            {value}
        </span>
    );
}

export function SeverityBadge({ severity }: { severity: BugSeverity }) {
    return <ColoredBadge value={severity} color={SEVERITY_COLORS[severity]} />;
}

export function StatusBadge({ status }: { status: BugStatus }) {
    return <ColoredBadge value={status} color={STATUS_COLORS[status]} />;
}

export function PriorityBadge({ priority }: { priority: BugPriority }) {
    return <ColoredBadge value={priority} color={PRIORITY_COLORS[priority]} />;
}
