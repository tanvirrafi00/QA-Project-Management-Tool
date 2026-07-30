'use client';

/**
 * Estimation summary KPI cards. Reads the server-computed summary (metrics are never recomputed
 * client-side — see docs/reporting-rules.md). Shown on the Estimation workspace Overview tab.
 */

import { Clock, CalendarDays, Users, Layers, Gauge, AlertTriangle, FileCheck, Activity } from 'lucide-react';
import { StatCard } from '@/components/core';
import type { EstimationProjectSummary } from '../types';

interface Props {
    summary: EstimationProjectSummary | null;
}

export function EstimationSummaryCards({ summary }: Props) {
    const s = summary;
    const fmt = (v: number | null | undefined, suffix = '') =>
        v == null ? 'N/A' : `${v}${suffix}`;

    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
                title="Total Effort (approved)"
                value={s ? fmt(s.totalEffortHours, ' hrs') : '—'}
                icon={Clock}
                color="blue"
            />
            <StatCard
                title="Est. Duration"
                value={s ? (s.estimatedDurationDays != null ? fmt(s.estimatedDurationDays, ' days') : 'N/A') : '—'}
                change={s && s.teamCapacityHoursPerDay ? `${s.teamCapacityHoursPerDay} hrs/day` : undefined}
                icon={CalendarDays}
                color="emerald"
            />
            <StatCard
                title="Engineers"
                value={s ? s.engineerCount : '—'}
                change={s ? `${s.teamCapacityHoursPerDay} hrs/day capacity` : undefined}
                icon={Users}
                color="purple"
            />
            <StatCard
                title="Modules"
                value={s ? s.moduleCount : '—'}
                change={s ? `${s.approvedModuleCount} approved` : undefined}
                icon={Layers}
                color="amber"
            />
            <StatCard
                title="Complexity Score"
                value={s ? s.complexityScore : '—'}
                icon={Gauge}
                color="amber"
            />
            <StatCard
                title="Risk Score (avg)"
                value={s ? s.riskScore : '—'}
                icon={AlertTriangle}
                color="purple"
            />
            <StatCard
                title="Estimations"
                value={s ? s.totalEstimations : '—'}
                change={s ? `${s.approvedEstimations} approved` : undefined}
                icon={FileCheck}
                color="blue"
            />
            <StatCard
                title="Final-Approved Hours"
                value={s ? fmt(s.finalApprovedEffortHours, ' hrs') : '—'}
                icon={Activity}
                color="emerald"
            />
        </div>
    );
}
