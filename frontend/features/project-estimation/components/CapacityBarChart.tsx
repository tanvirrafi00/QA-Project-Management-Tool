'use client';

/**
 * Workload distribution — assigned hours per engineer (bar). All values are server-computed
 * (CapacityReport.engineers); this only plots them.
 */

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { BarChart3 } from 'lucide-react';
import { ChartCard } from '@/components/ui/ChartCard';
import type { EngineerWorkload } from '../types';

const COLORS = ['#06B6D4', '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444'];
const TOOLTIP = { borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 13 };

export function CapacityBarChart({ engineers }: { engineers: EngineerWorkload[] }) {
    const data = engineers.map((e) => ({ name: e.engineerName, hours: e.assignedHours }));

    return (
        <ChartCard title="Workload Distribution" icon={<BarChart3 className="w-5 h-5" />} data={data} height={280}
            emptyTitle="No engineers assigned" emptyDescription="Assign engineers to modules to see workload distribution.">
            <ResponsiveContainer width="100%" height={280}>
                <BarChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748B' }} />
                    <YAxis tick={{ fontSize: 12, fill: '#64748B' }} />
                    <Tooltip contentStyle={TOOLTIP} formatter={(v: any) => [`${v} hrs`, 'Assigned']} />
                    <Bar dataKey="hours" name="Assigned hours" radius={[8, 8, 0, 0]}>
                        {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </ChartCard>
    );
}
