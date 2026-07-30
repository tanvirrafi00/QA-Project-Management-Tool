'use client';

/** Overview — two-column metadata grid. Fields without a backing model render as placeholders. */
import { Info } from 'lucide-react';
import type { TestCase } from '@/features/test-case-management/types';
import { SectionCard } from '../shared/SectionCard';
import { MetaGrid, type MetaItem } from '../shared/MetaGrid';
import { PRIORITY_COLOR, titleCase, formatDateTime } from '../shared/constants';

export function OverviewSection({ tc }: { tc: TestCase }) {
    const left: MetaItem[] = [
        { label: 'Module', value: tc.module || '—' },
        ...(tc.subModule ? [{ label: 'Sub-module', value: tc.subModule as string }] : []),
        { label: 'Project', value: tc.projectName || '—' },
        { label: 'Test Type', value: titleCase(tc.type) },
        { label: 'Priority', value: tc.priority, color: PRIORITY_COLOR[tc.priority] },
        { label: 'Execution Type', placeholder: true },
    ];

    const right: MetaItem[] = [
        { label: 'Status', value: tc.testStatus },
        { label: 'Assigned To', value: tc.assignedTo || 'Unassigned' },
        { label: 'Version', value: `v${tc.version}` },
        { label: 'Created', value: formatDateTime(tc.createdAt) },
        { label: 'Updated', value: formatDateTime(tc.updatedAt) },
        { label: 'Reviewer', placeholder: true },
        { label: 'Created By', placeholder: true },
        { label: 'Source', placeholder: true },
    ];

    return (
        <SectionCard id="overview" title="Overview" icon={<Info className="w-4 h-4" />} description="Core metadata for this test case.">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-6">
                <MetaGrid items={left} columns={2} />
                <MetaGrid items={right} columns={2} />
            </div>
        </SectionCard>
    );
}
