'use client';

/** History — audit timeline from TestCaseHistoryEntry (newest first). */
import { History } from 'lucide-react';
import type { TestCaseHistoryEntry } from '@/features/test-case-management/types';
import { SectionCard } from '../shared/SectionCard';
import { Timeline, type TimelineItem } from '../shared/Timeline';
import { formatDateTime, titleCase } from '../shared/constants';

function labelize(field: string): string {
    const map: Record<string, string> = {
        name: 'Name',
        module: 'Module',
        subModule: 'Sub-module',
        priority: 'Priority',
        testStatus: 'Status',
        assignedTo: 'Assigned To',
        actualResult: 'Actual Result',
        comments: 'Comments',
        relatedBugs: 'Related Bugs',
        executionDate: 'Execution Date',
        description: 'Description',
        tags: 'Tags',
    };
    return map[field] ?? titleCase(field);
}

export function HistorySection({ history }: { history: TestCaseHistoryEntry[] }) {
    const items: TimelineItem[] = [...history].reverse().map((e) => ({
        id: e.id,
        title: labelize(e.changedField),
        meta: formatDateTime(e.changedAt),
        body: (
            <>
                <span className="line-through text-[#CBD5E1]">{e.oldValue || '∅'}</span>
                <span className="mx-2 text-[#06B6D4]">→</span>
                <span className="font-medium text-[#1E293B]">{e.newValue || '∅'}</span>
            </>
        ),
        by: `by ${e.changedBy}`,
    }));

    return (
        <SectionCard id="history" title="History" icon={<History className="w-4 h-4" />} description="Full audit trail of changes.">
            <Timeline items={items} emptyLabel="No changes recorded yet." />
        </SectionCard>
    );
}
