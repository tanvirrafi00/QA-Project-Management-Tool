'use client';

/**
 * Expected Results — splits the expectedResult text into individual check-marked items when
 * it spans multiple lines/sentences; otherwise shows a single green-tinted block.
 */
import { Target, CheckCircle2 } from 'lucide-react';
import type { TestCase } from '@/features/test-case-management/types';
import { SectionCard } from '../shared/SectionCard';

export function ExpectedResultsSection({ tc }: { tc: TestCase }) {
    const text = tc.expectedResult?.trim();

    if (!text) {
        return (
            <SectionCard id="expected" title="Expected Results" icon={<Target className="w-4 h-4" />}>
                <p className="text-sm text-[#94A3B8] italic">No expected result defined.</p>
            </SectionCard>
        );
    }

    // Split on newlines, or on sentence boundaries when it's one long line with multiple sentences.
    const lines = text
        .split(/\n+/)
        .flatMap((line) => line.split(/(?<=[.!?])\s+/))
        .map((s) => s.trim())
        .filter(Boolean);

    const multi = lines.length > 1;

    return (
        <SectionCard id="expected" title="Expected Results" icon={<Target className="w-4 h-4" />}>
            {multi ? (
                <ul className="space-y-2">
                    {lines.map((line, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-[#1E293B]">
                            <CheckCircle2 className="w-4 h-4 text-[#22C55E] mt-0.5 flex-shrink-0" />
                            <span className="leading-relaxed">{line}</span>
                        </li>
                    ))}
                </ul>
            ) : (
                <div className="rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] p-3 text-sm text-[#166534] leading-relaxed">
                    {text}
                </div>
            )}
        </SectionCard>
    );
}
