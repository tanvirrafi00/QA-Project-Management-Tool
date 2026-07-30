'use client';

/** Description — the test objective (testCase.description). */
import { FileText } from 'lucide-react';
import type { TestCase } from '@/features/test-case-management/types';
import { SectionCard } from '../shared/SectionCard';

export function DescriptionSection({ tc }: { tc: TestCase }) {
    const objective = tc.description?.trim();
    return (
        <SectionCard id="description" title="Description" icon={<FileText className="w-4 h-4" />} description="Test objective and intent.">
            {objective ? (
                <p className="text-sm text-[#475569] leading-relaxed">{objective}</p>
            ) : (
                <p className="text-sm text-[#94A3B8] italic">No objective recorded for this test case.</p>
            )}
        </SectionCard>
    );
}
