/**
 * Shared bug field options — the single frontend source for bug enums, colors, and the status
 * workflow. Reused by the inline list cells, BugEditModal, and the list filters so they never drift.
 *
 * Colors mirror docs/reporting-rules.md §3 (the documented UI standard). The status transition map
 * mirrors the backend (`BUG_STATUS_TRANSITIONS` in backend bug-management types) — the backend is the
 * authoritative validator; this mirror only filters the inline Status dropdown to valid next states.
 */

import type { BugSeverity, BugPriority, BugStatus } from '../types';

export const SEVERITIES: BugSeverity[] = ['Critical', 'High', 'Medium', 'Low'];
export const PRIORITIES: BugPriority[] = ['P1', 'P2', 'P3', 'P4'];
export const STATUSES: BugStatus[] = [
    'Open', 'Assigned', 'In Progress', 'Fixed', 'Ready For QA', 'Verified', 'Closed', 'Reopened',
];

export const SEVERITY_COLOR: Record<BugSeverity, string> = {
    Critical: '#EF4444',
    High: '#F97316',
    Medium: '#CA8A04',
    Low: '#22C55E',
};

export const STATUS_COLOR: Record<BugStatus, string> = {
    Open: '#EF4444',
    Assigned: '#F97316',
    'In Progress': '#3B82F6',
    Fixed: '#8B5CF6',
    'Ready For QA': '#06B6D4',
    Verified: '#22C55E',
    Closed: '#64748B',
    Reopened: '#EF4444',
};

export const PRIORITY_COLOR: Record<BugPriority, string> = {
    P1: '#EF4444',
    P2: '#F97316',
    P3: '#F59E0B',
    P4: '#22C55E',
};

/** Status workflow — keep in sync with the backend `BUG_STATUS_TRANSITIONS`. */
export const BUG_STATUS_TRANSITIONS: Record<BugStatus, BugStatus[]> = {
    Open: ['Assigned', 'In Progress', 'Closed'],
    Assigned: ['Open', 'In Progress', 'Closed'],
    'In Progress': ['Open', 'Assigned', 'Fixed', 'Closed'],
    Fixed: ['In Progress', 'Ready For QA'],
    'Ready For QA': ['Fixed', 'Verified', 'In Progress'],
    Verified: ['Closed', 'Reopened'],
    Closed: ['Reopened'],
    Reopened: ['Assigned', 'In Progress', 'Open', 'Closed'],
};

/** Valid next statuses from `current` (always includes `current` so "no change" is selectable). */
export function nextStatuses(current: BugStatus): BugStatus[] {
    return [current, ...BUG_STATUS_TRANSITIONS[current]];
}
