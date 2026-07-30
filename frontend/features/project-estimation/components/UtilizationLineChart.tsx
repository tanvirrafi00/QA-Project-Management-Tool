'use client';

/**
 * Utilization trend across versions/releases (line). Each point is a version's team utilization %.
 * Null utilization (version with no approved effort) creates a gap. Values server-computed.
 */

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp } from 'lucide-react';
import { ChartCard } from '@/components/ui/ChartCard';
import type { CapacityByVersion } from '../types';

const TOOLTIP = { borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 13 };

export function UtilizationLineChart({ byVersion }: { byVersion: CapacityByVersion[] }) {
    const data = byVersion.map((v) => ({ label: v.label, utilization: v.utilizationPercent }));

    return (
        <ChartCard title="Utilization by Version" icon={<TrendingUp className="w-5 h-5" />} data={data} height={280}
            emptyTitle="No versions yet" emptyDescription="Add versions and approve estimates to see utilization across them.">
            <ResponsiveContainer width="100%" height={280}>
                <LineChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B' }} />
                    <YAxis tick={{ fontSize: 12, fill: '#64748B' }} tickFormatter={(v) => `${v}%`} />
                    <Tooltip contentStyle={TOOLTIP} formatter={(v: any) => (v == null ? ['N/A', 'Utilization'] : [`${v}%`, 'Utilization'])} />
                    <Line type="monotone" dataKey="utilization" name="Utilization %" stroke="#06B6D4" strokeWidth={2}
                        dot={{ r: 4, fill: '#06B6D4' }} connectNulls />
                </LineChart>
            </ResponsiveContainer>
        </ChartCard>
    );
}
