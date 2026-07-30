'use client';

/** Test Steps — one numbered card per step (never merged into a single paragraph). */
import { ListChecks } from 'lucide-react';
import type { TestCase } from '@/features/test-case-management/types';
import { SectionCard } from '../shared/SectionCard';

export function TestStepsSection({ tc }: { tc: TestCase }) {
    const steps = tc.testSteps ?? [];
    return (
        <SectionCard
            id="steps"
            title="Test Steps"
            icon={<ListChecks className="w-4 h-4" />}
            description={`${steps.length} step${steps.length === 1 ? '' : 's'}`}
        >
            {steps.length === 0 ? (
                <p className="text-sm text-[#94A3B8] italic">No steps defined for this test case.</p>
            ) : (
                <ol className="space-y-3">
                    {steps.map((step, i) => (
                        <li key={i} className="flex items-start gap-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3">
                            <span className="w-6 h-6 rounded-full bg-[#ECFEFF] text-[#06B6D4] text-xs font-bold flex items-center justify-center flex-shrink-0">
                                {i + 1}
                            </span>
                            <span className="text-sm text-[#1E293B] leading-relaxed">{step}</span>
                        </li>
                    ))}
                </ol>
            )}
        </SectionCard>
    );
}
