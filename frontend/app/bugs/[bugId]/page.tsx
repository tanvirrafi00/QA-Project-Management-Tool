'use client';

/**
 * Bug Details page.
 *
 * Route: /bugs/[bugId]
 *
 * Thin client page (mirrors `app/test-management/test-cases/[testCaseId]/page.tsx`): fetches the bug,
 * its edit history, and the project's full bug list (for prev/next), then renders the composed
 * `<BugDetailsView>`. `useParams()` is the Next 16 client way to read the dynamic segment.
 *
 * Replaces the former right-side `BugDetailDrawer` with a dedicated full-page view (ADR/test-case
 * details precedent).
 */
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2, AlertTriangle, AlertCircle, RefreshCw, ArrowLeft } from 'lucide-react';
import { AppShell, PageContainer } from '@/components/layout';
import { Button } from '@/components/core';
import { bugService } from '@/features/bug-management/services/bug.service';
import type { Bug, BugHistoryEntry } from '@/features/bug-management/types';
import { BugDetailsView } from '@/features/bug-management/components/details/BugDetailsView';

export default function BugDetailsPage() {
    const params = useParams();
    const router = useRouter();
    const id = String(params?.bugId ?? '');

    const [bug, setBug] = useState<Bug | null>(null);
    const [history, setHistory] = useState<BugHistoryEntry[]>([]);
    const [projectBugs, setProjectBugs] = useState<Bug[]>([]);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [error, setError] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setNotFound(false);
        setError(false);
        try {
            const [bugRes, histRes] = await Promise.all([
                bugService.getBug(id),
                bugService.getBugHistory(id),
            ]);
            if (!bugRes.success || !bugRes.data) {
                setBug(null);
                setNotFound(true);
            } else {
                setBug(bugRes.data);
                // Project list for prev/next navigation (project taken from the loaded bug).
                const listRes = await bugService.listBugs({ projectName: bugRes.data.projectName });
                setProjectBugs(listRes.success && listRes.data ? listRes.data : []);
            }
            setHistory(histRes.success && histRes.data ? histRes.data : []);
        } catch {
            // A thrown fetch is an error (retry), not "not found".
            setError(true);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        if (id) load();
    }, [load]);

    if (loading) {
        return (
            <AppShell>
                <PageContainer>
                    <div role="status" aria-live="polite" className="flex flex-col items-center justify-center py-20">
                        <Loader2 className="w-8 h-8 text-[#06B6D4] animate-spin mb-3" />
                        <p className="text-sm text-[#64748B]">Loading bug…</p>
                    </div>
                </PageContainer>
            </AppShell>
        );
    }

    if (error) {
        return (
            <AppShell>
                <PageContainer>
                    <div role="alert" className="bg-white rounded-2xl border border-[#E2E8F0] p-12 text-center">
                        <AlertCircle className="w-8 h-8 text-[#EF4444] mx-auto mb-3" />
                        <h2 className="text-base font-semibold text-[#1E293B]">Couldn&apos;t load bug</h2>
                        <p className="text-sm text-[#64748B] mt-1">Something went wrong while fetching this bug.</p>
                        <div className="flex items-center justify-center gap-3 mt-4">
                            <Button variant="secondary" size="sm" onClick={() => load()} leftIcon={<RefreshCw className="w-4 h-4" />}>
                                Retry
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => router.push('/bug-dashboard')} leftIcon={<ArrowLeft className="w-4 h-4" />}>
                                Back to Bug Dashboard
                            </Button>
                        </div>
                    </div>
                </PageContainer>
            </AppShell>
        );
    }

    if (notFound || !bug) {
        return (
            <AppShell>
                <PageContainer>
                    <div className="bg-white rounded-2xl border border-[#E2E8F0] p-12 text-center">
                        <AlertTriangle className="w-8 h-8 text-[#F59E0B] mx-auto mb-3" />
                        <h2 className="text-base font-semibold text-[#1E293B]">Bug not found</h2>
                        <p className="text-sm text-[#64748B] mt-1">It may have been deleted.</p>
                        <Button
                            variant="secondary"
                            size="sm"
                            className="mt-4"
                            onClick={() => router.push('/bug-dashboard')}
                            leftIcon={<ArrowLeft className="w-4 h-4" />}
                        >
                            Back to Bug Dashboard
                        </Button>
                    </div>
                </PageContainer>
            </AppShell>
        );
    }

    return (
        <AppShell>
            <PageContainer>
                <BugDetailsView
                    bug={bug}
                    history={history}
                    projectBugs={projectBugs}
                    onReload={load}
                    onDeleted={() => router.push('/bug-dashboard')}
                />
            </PageContainer>
        </AppShell>
    );
}
