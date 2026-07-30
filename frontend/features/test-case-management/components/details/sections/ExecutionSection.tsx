'use client';

/**
 * Execution — a metadata grid (status / executed-by / date + coming-soon time/env/browser)
 * followed by a large bordered Actual Result card.
 */
import { PlayCircle, ClipboardCheck } from 'lucide-react';
import type { TestCase } from '@/features/test-case-management/types';
import { SectionCard } from '../shared/SectionCard';
import { MetaGrid, type MetaItem } from '../shared/MetaGrid';
import { StatusPill } from '../shared/Badges';
import { formatDate } from '../shared/constants';

export function ExecutionSection({ tc }: { tc: TestCase }) {
    const cards: MetaItem[] = [
        { label: 'Execution Status', value: <StatusPill status={tc.testStatus} size="md" /> },
        { label: 'Executed By', value: tc.assignedTo || 'Unassigned' },
        { label: 'Execution Date', value: tc.executionDate ? formatDate(tc.executionDate) : 'Not executed' },
        { label: 'Execution Time', placeholder: true },
        { label: 'Environment', placeholder: true },
        { label: 'Browser', placeholder: true },
    ];

    const hasActual = !!tc.actualResult?.trim();

    return (
        <SectionCard id="execution" title="Execution" icon={<PlayCircle className="w-4 h-4" />} description="Run context and the recorded actual outcome.">
            <MetaGrid items={cards} columns={3} />

            <div className="mt-6">
                <div className="flex items-center gap-2 mb-2">
                    <ClipboardCheck className="w-4 h-4 text-[#64748B]" />
                    <h3 className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">Actual Result</h3>
                </div>
                <div
                    className={`rounded-xl border p-4 text-sm leading-relaxed whitespace-pre-wrap ${
                        hasActual
                            ? 'border-[#FECACA] bg-[#FEF2F2] text-[#1E293B]'
                            : 'border-[#E2E8F0] bg-[#F8FAFC] text-[#94A3B8] italic'
                    }`}
                >
                    {hasActual ? tc.actualResult : 'Not yet executed — record the outcome via Execute or Edit.'}
                </div>
            </div>
        </SectionCard>
    );
}
