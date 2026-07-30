'use client';

/**
 * Related Bugs — resolves the `relatedBugs` string IDs into full Bug objects via
 * `bugService.getBug` (accepts display bugId or internal id), renders a clickable table.
 * IDs that fail to resolve degrade to muted chips instead of blocking the section.
 */
import { useEffect, useState } from 'react';
import { Bug as BugIcon, Loader2 } from 'lucide-react';
import type { TestCase } from '@/features/test-case-management/types';
import type { Bug } from '@/features/bug-management/types';
import { bugService } from '@/features/bug-management/services/bug.service';
import { SectionCard } from '../shared/SectionCard';
import { BugRow } from '../shared/BugRow';
import { EmptySection } from '../shared/EmptySection';

export function RelatedBugsSection({ tc }: { tc: TestCase }) {
    const ids = tc.relatedBugs ?? [];
    const idsKey = ids.join(',');
    const [bugs, setBugs] = useState<Bug[]>([]);
    const [unresolved, setUnresolved] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        let cancelled = false;
        if (ids.length === 0) {
            setBugs([]);
            setUnresolved([]);
            return;
        }
        setLoading(true);
        Promise.all(
            ids.map((id) =>
                bugService
                    .getBug(id)
                    .then((r) => (r.success && r.data ? r.data : null))
                    .catch(() => null),
            ),
        ).then((results) => {
            if (cancelled) return;
            setBugs(results.filter(Boolean) as Bug[]);
            setUnresolved(ids.filter((_, i) => results[i] === null));
            setLoading(false);
        });
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tc.id, idsKey]);

    return (
        <SectionCard
            id="bugs"
            title="Related Bugs"
            icon={<BugIcon className="w-4 h-4" />}
            description={ids.length ? `${ids.length} linked` : undefined}
        >
            {loading ? (
                <div className="flex items-center gap-2 text-sm text-[#94A3B8] py-6 justify-center">
                    <Loader2 className="w-4 h-4 animate-spin" /> Resolving linked bugs…
                </div>
            ) : bugs.length === 0 ? (
                <EmptySection
                    variant="empty"
                    icon={BugIcon}
                    title="No related bugs found"
                    description="Link a bug to this test case to improve traceability."
                />
            ) : (
                <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#64748B] uppercase tracking-wider">Bug ID</th>
                                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#64748B] uppercase tracking-wider">Title</th>
                                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#64748B] uppercase tracking-wider">Status</th>
                                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#64748B] uppercase tracking-wider">Severity</th>
                                    <th className="px-4 py-2.5" />
                                </tr>
                            </thead>
                            <tbody>
                                {bugs.map((bug) => (
                                    <BugRow key={bug.id} bug={bug} />
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {unresolved.length > 0 && (
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-[#94A3B8]">Could not resolve:</span>
                    {unresolved.map((id) => (
                        <span
                            key={id}
                            title="This bug ID could not be found."
                            className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-mono bg-[#F1F5F9] text-[#94A3B8] line-through"
                        >
                            {id}
                        </span>
                    ))}
                </div>
            )}
        </SectionCard>
    );
}
