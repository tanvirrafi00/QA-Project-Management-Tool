'use client';

/**
 * Test Case Details page.
 *
 * Route: /test-management/test-cases/[testCaseId]
 *
 * Thin client page (mirrors `app/projects/[id]/page.tsx`): fetches the test case, its edit
 * history, and the project's full case list (for prev/next), then renders the composed
 * `<TestCaseDetailsView>`. `useParams()` is the Next 16 client way to read the dynamic
 * segment (no async `params`, no `<Suspense>` needed — `useSearchParams` is not used here).
 */
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2, AlertTriangle, AlertCircle, RefreshCw, ArrowLeft } from 'lucide-react';
import { AppShell, PageContainer } from '@/components/layout';
import { Button } from '@/components/core';
import { testCaseService } from '@/features/test-case-management/services/test-case.service';
import type { TestCase, TestCaseHistoryEntry } from '@/features/test-case-management/types';
import { TestCaseDetailsView } from '@/features/test-case-management/components/details/TestCaseDetailsView';

export default function TestCaseDetailsPage() {
    const params = useParams();
    const router = useRouter();
    const id = String(params?.testCaseId ?? '');

    const [testCase, setTestCase] = useState<TestCase | null>(null);
    const [history, setHistory] = useState<TestCaseHistoryEntry[]>([]);
    const [projectCases, setProjectCases] = useState<TestCase[]>([]);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [error, setError] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setNotFound(false);
        setError(false);
        try {
            const [tcRes, histRes] = await Promise.all([
                testCaseService.getTestCase(id),
                testCaseService.getTestCaseHistory(id),
            ]);
            if (!tcRes.success || !tcRes.data) {
                setTestCase(null);
                setNotFound(true);
            } else {
                setTestCase(tcRes.data);
                // Project list for prev/next navigation (project taken from the loaded case).
                const listRes = await testCaseService.listTestCases({ projectName: tcRes.data.projectName });
                setProjectCases(listRes.success && listRes.data ? listRes.data : []);
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
                        <p className="text-sm text-[#64748B]">Loading test case…</p>
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
                        <h2 className="text-base font-semibold text-[#1E293B]">Couldn&apos;t load test case</h2>
                        <p className="text-sm text-[#64748B] mt-1">Something went wrong while fetching this test case.</p>
                        <div className="flex items-center justify-center gap-3 mt-4">
                            <Button variant="secondary" size="sm" onClick={() => load()} leftIcon={<RefreshCw className="w-4 h-4" />}>
                                Retry
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => router.push('/test-management')} leftIcon={<ArrowLeft className="w-4 h-4" />}>
                                Back to Test Cases
                            </Button>
                        </div>
                    </div>
                </PageContainer>
            </AppShell>
        );
    }

    if (notFound || !testCase) {
        return (
            <AppShell>
                <PageContainer>
                    <div className="bg-white rounded-2xl border border-[#E2E8F0] p-12 text-center">
                        <AlertTriangle className="w-8 h-8 text-[#F59E0B] mx-auto mb-3" />
                        <h2 className="text-base font-semibold text-[#1E293B]">Test case not found</h2>
                        <p className="text-sm text-[#64748B] mt-1">It may have been deleted.</p>
                        <Button
                            variant="secondary"
                            size="sm"
                            className="mt-4"
                            onClick={() => router.push('/test-management')}
                            leftIcon={<ArrowLeft className="w-4 h-4" />}
                        >
                            Back to Test Cases
                        </Button>
                    </div>
                </PageContainer>
            </AppShell>
        );
    }

    return (
        <AppShell>
            <PageContainer>
                <TestCaseDetailsView
                    testCase={testCase}
                    history={history}
                    projectCases={projectCases}
                    onReload={load}
                    onDeleted={() => router.push('/test-management')}
                />
            </PageContainer>
        </AppShell>
    );
}
