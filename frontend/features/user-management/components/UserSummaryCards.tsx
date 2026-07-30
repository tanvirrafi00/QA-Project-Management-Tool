/**
 * UserSummaryCards — the admin summary cards (Pending Approvals / Active / Rejected) driven by
 * `GET /api/users/summary`. Reuses the shared `StatCard`.
 */

import { Clock, CheckCircle2, XCircle } from 'lucide-react';
import { StatCard } from '@/components/core';
import type { UserSummary } from '../types';

interface Props {
    summary: UserSummary | null;
}

export function UserSummaryCards({ summary }: Props) {
    const pending = summary?.pendingApproval ?? 0;
    const active = summary?.active ?? 0;
    const rejected = summary?.rejected ?? 0;

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard title="Pending Approvals" value={pending} icon={Clock} color="amber" />
            <StatCard title="Active Users" value={active} icon={CheckCircle2} color="emerald" />
            <StatCard title="Rejected Users" value={rejected} icon={XCircle} color="purple" />
        </div>
    );
}
