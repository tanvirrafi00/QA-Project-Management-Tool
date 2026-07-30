'use client';

/**
 * Module breakdown table — one row per module with its engineers, summed hours, peak complexity/risk,
 * and approval progress. Provides "Add Estimate" per module (and "Add Module" when empty).
 */

import { Plus, Layers, ClipboardList, GitCompare } from 'lucide-react';
import { Badge, Button } from '@/components/core';
import { EmptyState } from '@/components/ui/EmptyState';
import type { ComplexityLevel, EstimationModule, ModuleEstimation, RiskLevel } from '../types';

const COMPLEXITY_ORDER: Record<ComplexityLevel, number> = { Low: 1, Medium: 2, High: 3, Critical: 4 };
const RISK_ORDER: Record<RiskLevel, number> = { Low: 1, Medium: 2, High: 3 };

function complexityVariant(c?: ComplexityLevel) {
    switch (c) {
        case 'Critical': return 'error';
        case 'High': return 'warning';
        case 'Medium': return 'info';
        default: return 'success';
    }
}
function riskVariant(r?: RiskLevel) {
    switch (r) {
        case 'High': return 'error';
        case 'Medium': return 'warning';
        default: return 'success';
    }
}
function maxComplexity(list: ModuleEstimation[]): ComplexityLevel | undefined {
    return list.reduce<ComplexityLevel | undefined>((acc, e) => {
        if (!e.complexity) return acc;
        if (!acc || COMPLEXITY_ORDER[e.complexity] > COMPLEXITY_ORDER[acc]) return e.complexity;
        return acc;
    }, undefined);
}
function maxRisk(list: ModuleEstimation[]): RiskLevel | undefined {
    return list.reduce<RiskLevel | undefined>((acc, e) => {
        if (!e.riskLevel) return acc;
        if (!acc || RISK_ORDER[e.riskLevel] > RISK_ORDER[acc]) return e.riskLevel;
        return acc;
    }, undefined);
}

interface Props {
    modules: EstimationModule[];
    estimationsByModule: Record<string, ModuleEstimation[]>;
    onAddEstimate: (module: EstimationModule) => void;
    onAddModule: () => void;
    /** Optional: open the lead comparison view for a module (shown when it has >1 estimate). */
    onCompare?: (module: EstimationModule) => void;
}

export function ModuleBreakdownTable({ modules, estimationsByModule, onAddEstimate, onAddModule, onCompare }: Props) {
    if (modules.length === 0) {
        return (
            <div className="bg-white rounded-2xl border border-[#E2E8F0]">
                <EmptyState
                    icon={Layers}
                    title="No modules yet"
                    description="Create the first QA module for this project to start estimating effort."
                    action={{ label: 'Add Module', onClick: onAddModule, icon: <Plus className="w-4 h-4" /> }}
                />
            </div>
        );
    }

    return (
        <div className="bg-white rounded-2xl border border-[#E2E8F0] overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                            <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wider">Module</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wider">Engineers</th>
                            <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wider">Hours</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wider">Complexity</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wider">Risk</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wider">Approval</th>
                            <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {modules.map((m) => {
                            const estimates = estimationsByModule[m.id] ?? [];
                            const engineers = Array.from(new Set(estimates.map((e) => e.engineerName)));
                            const hours = estimates.reduce((acc, e) => acc + (e.estimatedHours ?? 0), 0);
                            const approved = estimates.filter((e) => e.isFinalApproved && e.status === 'Approved').length;
                            return (
                                <tr key={m.id} className="border-b border-[#E2E8F0] last:border-0 hover:bg-[#F8FAFC]">
                                    <td className="px-4 py-3">
                                        <div className="font-semibold text-[#0F172A]">{m.name}</div>
                                        {m.description && (
                                            <div className="text-xs text-[#94A3B8] line-clamp-1">{m.description}</div>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-[#475569]">
                                        {engineers.length ? engineers.join(', ') : <span className="text-[#94A3B8]">—</span>}
                                    </td>
                                    <td className="px-4 py-3 text-right text-sm font-semibold text-[#0F172A]">
                                        {hours > 0 ? `${Math.round(hours * 100) / 100}` : '—'}
                                    </td>
                                    <td className="px-4 py-3">
                                        {estimates.length ? (
                                            <Badge variant={complexityVariant(maxComplexity(estimates))} size="sm">
                                                {maxComplexity(estimates) ?? '—'}
                                            </Badge>
                                        ) : <span className="text-[#94A3B8]">—</span>}
                                    </td>
                                    <td className="px-4 py-3">
                                        {estimates.length ? (
                                            <Badge variant={riskVariant(maxRisk(estimates))} size="sm">
                                                {maxRisk(estimates) ?? '—'}
                                            </Badge>
                                        ) : <span className="text-[#94A3B8]">—</span>}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-[#475569]">
                                        {estimates.length ? `${approved}/${estimates.length}` : <span className="text-[#94A3B8]">—</span>}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex items-center justify-end gap-1.5">
                                            {estimates.length > 1 && onCompare && (
                                                <Button variant="ghost" size="sm" onClick={() => onCompare(m)} leftIcon={<GitCompare className="w-4 h-4" />}>
                                                    Compare
                                                </Button>
                                            )}
                                            <Button variant="secondary" size="sm" onClick={() => onAddEstimate(m)} leftIcon={<ClipboardList className="w-4 h-4" />}>
                                                Estimate
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <div className="flex justify-end p-3 border-t border-[#E2E8F0]">
                <Button variant="ghost" size="sm" onClick={onAddModule} leftIcon={<Plus className="w-4 h-4" />}>
                    Add Module
                </Button>
            </div>
        </div>
    );
}
