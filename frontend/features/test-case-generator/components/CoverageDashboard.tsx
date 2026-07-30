'use client';

/**
 * CoverageDashboard — post-generation summary: KPI cards + test-type distribution + coverage
 * warnings. All numbers come from the server response (summary.typeDistribution + coverage) — the
 * frontend only reads, never recomputes (docs/reporting-rules.md §1).
 */

import { Target, CheckCircle2, Percent, Layers, AlertTriangle, ShieldCheck, ListOrdered } from 'lucide-react';
import type { TestGenerationResponse } from '../types';
import { typeLabel, testTypeOrderIndex } from '../utils/testCaseUtils';

interface CoverageDashboardProps {
    result: TestGenerationResponse;
}

const PHASE_STATUS_COLOR: Record<string, string> = {
    complete: '#10B981',
    expanded: '#3B82F6',
    skipped: '#94A3B8',
    partial: '#F59E0B',
};

export function CoverageDashboard({ result }: CoverageDashboardProps) {
    const dist = result.summary.typeDistribution ?? {};
    // Sort the distribution in CANONICAL order (Functional first) — not by count.
    const entries = Object.entries(dist).filter(([, n]) => n > 0).sort((a, b) => testTypeOrderIndex(a[0]) - testTypeOrderIndex(b[0]));
    const maxCount = entries.reduce((m, [, n]) => Math.max(m, n), 1);

    const covered = result.coverage.covered?.length ?? 0;
    const missing = result.coverage.missing?.length ?? 0;
    const requirementTotal = covered + missing;

    const strategy = result.strategy;
    const fc = strategy?.functionalCoverage;

    const cards = [
        { icon: Target, label: 'GENERATED', value: result.summary.totalCases, color: '#3B82F6', bg: '#EEF2FF' },
        { icon: Percent, label: 'COVERAGE', value: `${result.coverage.score}%`, color: '#8B5CF6', bg: '#EDE9FE' },
        { icon: CheckCircle2, label: 'REQS COVERED', value: requirementTotal > 0 ? `${covered}/${requirementTotal}` : '—', color: '#10B981', bg: '#ECFDF5' },
        { icon: Layers, label: 'TEST TYPES', value: entries.length, color: '#F59E0B', bg: '#FFFBEB' },
    ];

    return (
        <div className="space-y-4">
            {/* Functional-first strategy banner */}
            {strategy && (
                <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: strategy.functionalComplete ? '#ECFDF5' : '#FFFBEB' }}>
                                <ShieldCheck className="w-5 h-5" style={{ color: strategy.functionalComplete ? '#10B981' : '#F59E0B' }} />
                            </div>
                            <div>
                                <h3 className="text-sm font-semibold text-[#1E293B] flex items-center gap-2">
                                    Functional-First Coverage Strategy
                                    <span
                                        className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
                                        style={{
                                            background: strategy.functionalComplete ? '#ECFDF5' : '#FFFBEB',
                                            color: strategy.functionalComplete ? '#10B981' : '#B45309',
                                        }}
                                    >
                                        {strategy.functionalComplete ? 'Functional Complete' : 'Functional Gaps'}
                                    </span>
                                </h3>
                                <p className="text-xs text-[#64748B] mt-1">
                                    Functional coverage generated first &amp; validated before secondary types.
                                    {' '}
                                    <strong className="text-[#0F172A]">{strategy.functionalCount}</strong> functional +{' '}
                                    <strong className="text-[#0F172A]">{strategy.secondaryCount}</strong> secondary cases.
                                    {fc && fc.total > 0 && (
                                        <> Functional requirement gate: <strong className="text-[#0F172A]">{fc.covered}/{fc.total}</strong> mapped.</>
                                    )}
                                </p>
                            </div>
                        </div>
                    </div>
                    {/* Phase progression */}
                    <div className="flex items-center gap-1.5 mt-4 flex-wrap">
                        <ListOrdered className="w-3.5 h-3.5 text-[#94A3B8] flex-shrink-0" />
                        {strategy.phases.map((p) => (
                            <span
                                key={p.phase}
                                title={`${p.name}: ${p.detail}`}
                                className="text-[10px] font-semibold px-2 py-1 rounded-md flex items-center gap-1"
                                style={{ background: '#F8FAFC', color: PHASE_STATUS_COLOR[p.status] ?? '#64748B', border: '1px solid #E2E8F0' }}
                            >
                                <span className="w-1.5 h-1.5 rounded-full" style={{ background: PHASE_STATUS_COLOR[p.status] ?? '#94A3B8' }} />
                                {p.phase}. {p.name}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* KPI cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {cards.map((c) => (
                    <div key={c.label} className="bg-white rounded-xl border border-[#E2E8F0] p-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: c.bg }}>
                            <c.icon className="w-5 h-5" style={{ color: c.color }} />
                        </div>
                        <div className="min-w-0">
                            <div className="text-[10px] uppercase tracking-wide font-semibold text-[#94A3B8]">{c.label}</div>
                            <div className="text-xl font-bold text-[#0F172A] leading-tight">{c.value}</div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Type distribution */}
                <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
                    <h3 className="text-sm font-semibold text-[#1E293B] mb-4">Test-Type Distribution</h3>
                    {entries.length === 0 ? (
                        <p className="text-sm text-[#94A3B8]">No distribution available.</p>
                    ) : (
                        <div className="space-y-2.5">
                            {entries.map(([type, count]) => (
                                <div key={type} className="flex items-center gap-3">
                                    <div className="w-28 text-xs font-medium text-[#475569] truncate flex-shrink-0">{typeLabel(type)}</div>
                                    <div className="flex-1 h-6 bg-[#F1F5F9] rounded-md overflow-hidden">
                                        <div
                                            className="h-full bg-gradient-to-r from-[#06B6D4] to-[#3B82F6] rounded-md transition-all"
                                            style={{ width: `${Math.max(6, (count / maxCount) * 100)}%` }}
                                        />
                                    </div>
                                    <div className="w-8 text-right text-xs font-bold text-[#0F172A]">{count}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Coverage warnings */}
                <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
                    <h3 className="text-sm font-semibold text-[#1E293B] mb-4 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-[#F59E0B]" /> Coverage Notes
                    </h3>
                    {missing > 0 ? (
                        <div className="space-y-1.5">
                            {result.coverage.missing.slice(0, 8).map((m, i) => (
                                <div key={i} className="flex items-start gap-2 text-xs text-[#92400E]">
                                    <span className="w-1 h-1 rounded-full bg-[#F59E0B] mt-1.5 flex-shrink-0" />
                                    {m}
                                </div>
                            ))}
                            {result.coverage.missing.length > 8 && (
                                <div className="text-xs text-[#94A3B8] pl-3">+ {result.coverage.missing.length - 8} more</div>
                            )}
                        </div>
                    ) : (
                        <p className="text-sm text-[#10B981]">All selected types covered — no gaps detected.</p>
                    )}
                    {result.coverage.recommendations && result.coverage.recommendations.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-[#F1F5F9] space-y-1">
                            {result.coverage.recommendations.slice(0, 3).map((r, i) => (
                                <div key={i} className="text-xs text-[#475569]">• {r}</div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
