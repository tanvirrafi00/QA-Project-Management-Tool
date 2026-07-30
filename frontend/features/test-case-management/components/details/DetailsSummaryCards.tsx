'use client';

/**
 * DetailsSummaryCards — a scannable row of 6 stat tiles (Priority · Status · Assigned To ·
 * Execution Date · Related Bugs · Test Type). All backed by real fields; same card style as
 * the list page's KPICards.
 */
import {
    Flag, Activity, User, Calendar, Bug as BugIcon, FlaskConical, type LucideIcon,
} from 'lucide-react';
import type { TestCase } from '@/features/test-case-management/types';
import { PRIORITY_COLOR, STATUS_COLOR, formatDate, titleCase } from './shared/constants';

function Tile({ icon: Icon, label, value, color, bg }: { icon: LucideIcon; label: string; value: string; color: string; bg: string }) {
    return (
        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-4">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-2.5" style={{ background: bg, color }}>
                <Icon className="w-4 h-4" />
            </div>
            <p className="text-base font-bold text-[#0F172A] tracking-tight break-words">{value}</p>
            <p className="text-[11px] text-[#64748B] mt-0.5">{label}</p>
        </div>
    );
}

export function DetailsSummaryCards({ tc }: { tc: TestCase }) {
    const relatedCount = (tc.relatedBugs ?? []).length;
    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <Tile icon={Flag} label="Priority" value={tc.priority} color={PRIORITY_COLOR[tc.priority]} bg={`${PRIORITY_COLOR[tc.priority]}15`} />
            <Tile icon={Activity} label="Status" value={tc.testStatus} color={STATUS_COLOR[tc.testStatus]} bg={`${STATUS_COLOR[tc.testStatus]}15`} />
            <Tile icon={User} label="Assigned To" value={tc.assignedTo || 'Unassigned'} color="#3B82F6" bg="#EFF6FF" />
            <Tile icon={Calendar} label="Execution Date" value={tc.executionDate ? formatDate(tc.executionDate) : '—'} color="#06B6D4" bg="#ECFEFF" />
            <Tile icon={BugIcon} label="Related Bugs" value={String(relatedCount)} color="#8B5CF6" bg="#F5F3FF" />
            <Tile icon={FlaskConical} label="Test Type" value={titleCase(tc.type)} color="#0EA5E9" bg="#F0F9FF" />
        </div>
    );
}
