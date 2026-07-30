'use client';

/**
 * Team utilization gauge — overall utilization as a doughnut with the % centered. Color: green ≤85%,
 * amber 85–100%, red >100% (over-utilization is shown, not clamped). Null utilization (no approved
 * effort / zero capacity) renders the empty state.
 */

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { Gauge } from 'lucide-react';
import { ChartCard } from '@/components/ui/ChartCard';

const TOOLTIP = { borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 13 };

function colorFor(pct: number) {
    if (pct > 100) return '#EF4444';
    if (pct > 85) return '#F59E0B';
    return '#10B981';
}

export function CapacityGaugeChart({ utilizationPercent }: { utilizationPercent: number | null }) {
    const has = utilizationPercent != null;
    const pct = Math.round(utilizationPercent ?? 0);
    const data = has
        ? [
            { name: 'Utilized', value: Math.min(pct, 100) },
            { name: 'Headroom', value: Math.max(0, 100 - pct) },
        ]
        : [];

    return (
        <ChartCard title="Team Utilization" icon={<Gauge className="w-5 h-5" />} data={data} height={280}
            emptyTitle="Utilization not available" emptyDescription="Approve and select a final estimate so a project duration can be computed.">
            <div className="relative" style={{ height: 280 }}>
                <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                        <Pie data={data} dataKey="value" innerRadius={80} outerRadius={110} startAngle={90} endAngle={-270} paddingAngle={2}>
                            <Cell fill={colorFor(pct)} />
                            <Cell fill="#E2E8F0" />
                        </Pie>
                        <Tooltip contentStyle={TOOLTIP} formatter={(v: any, n: any) => [`${v}%`, n]} />
                    </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-3xl font-bold text-[#0F172A]">{pct}%</span>
                    <span className="text-xs text-[#64748B] mt-1">
                        {pct > 100 ? 'Over-utilized' : pct > 85 ? 'Near capacity' : 'Healthy'}
                    </span>
                </div>
            </div>
        </ChartCard>
    );
}
