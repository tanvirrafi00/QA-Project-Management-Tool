'use client';

/**
 * TestCaseDetailsView — composition root for the Test Case Details page.
 *
 * Renders the sticky header, summary cards, the left section-nav + section stack, and a
 * mobile floating action bar. Owns: Edit/Execute modals, Delete confirm, Duplicate/Export,
 * quick-status, prev/next navigation, and the keyboard-shortcut listener.
 *
 * No data fetching lives here — the route `page.tsx` fetches the case + history + project
 * list and passes them in (mirrors the project-details page pattern).
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Copy, Download, Trash2 } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
    testCaseService,
} from '@/features/test-case-management/services/test-case.service';
import type {
    TestCase, TestCaseHistoryEntry, TestCaseStatus, SaveTestCaseInput,
} from '@/features/test-case-management/types';

import { DetailsHeader } from './DetailsHeader';
import { DetailsSummaryCards } from './DetailsSummaryCards';
import { DetailsSectionNav } from './DetailsSectionNav';
import { OverviewSection } from './sections/OverviewSection';
import { DescriptionSection } from './sections/DescriptionSection';
import { TestStepsSection } from './sections/TestStepsSection';
import { ExpectedResultsSection } from './sections/ExpectedResultsSection';
import { ExecutionSection } from './sections/ExecutionSection';
import { RelatedBugsSection } from './sections/RelatedBugsSection';
import { CommentsSection } from './sections/CommentsSection';
import { AttachmentsSection } from './sections/AttachmentsSection';
import { AIInsightsSection } from './sections/AIInsightsSection';
import { HistorySection } from './sections/HistorySection';
import { TestCaseEditModal } from './TestCaseEditModal';
import { exportTestCaseToXlsx } from './utils/exportTestCase';

interface TestCaseDetailsViewProps {
    testCase: TestCase;
    history: TestCaseHistoryEntry[];
    projectCases: TestCase[];
    onReload: () => void;
    onDeleted: () => void;
}

export function TestCaseDetailsView({
    testCase, history, projectCases, onReload, onDeleted,
}: TestCaseDetailsViewProps) {
    const router = useRouter();
    const toast = useToast();

    const [showEdit, setShowEdit] = useState(false);
    const [showDelete, setShowDelete] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [duplicating, setDuplicating] = useState(false);

    // Prev/Next over the full project list (position-stable across the project).
    const index = projectCases.findIndex((c) => c.id === testCase.id);
    const prevId = index > 0 ? projectCases[index - 1].id : null;
    const nextId = index >= 0 && index < projectCases.length - 1 ? projectCases[index + 1].id : null;

    const detailsPath = (id: string) => `/test-management/test-cases/${id}`;

    const handleBack = () => {
        if (typeof window !== 'undefined' && window.history.length <= 1) {
            router.push('/test-management');
        } else {
            router.back();
        }
    };

    const handleQuickStatus = async (status: TestCaseStatus) => {
        const result = await testCaseService.updateTestCase(testCase.id, { testStatus: status, changedBy: 'QA Team' });
        if (result.success) {
            toast.success(`Status updated to ${status}.`);
            onReload();
        } else {
            toast.error(result.error || 'Failed to update status.');
        }
    };

    const handleDuplicate = async () => {
        setDuplicating(true);
        const input: SaveTestCaseInput = {
            projectName: testCase.projectName,
            module: testCase.module,
            subModule: testCase.subModule,
            name: `${testCase.name} (Copy)`,
            description: testCase.description,
            type: testCase.type,
            priority: testCase.priority,
            testSteps: testCase.testSteps,
            expectedResult: testCase.expectedResult,
            testStatus: 'Not Executed',
            actualResult: '',
            assignedTo: testCase.assignedTo,
            executionDate: null,
            comments: '',
            relatedBugs: testCase.relatedBugs,
            tags: testCase.tags,
        };
        const result = await testCaseService.saveTestCase(input);
        setDuplicating(false);
        if (result.success && result.data) {
            toast.success('Test case duplicated.');
            router.push(detailsPath(result.data.id));
        } else {
            toast.error(result.error || 'Failed to duplicate test case.');
        }
    };

    const handleExport = () => {
        try {
            exportTestCaseToXlsx(testCase);
            toast.success('Exported test case.');
        } catch {
            toast.error('Failed to export test case.');
        }
    };

    const handleDelete = async () => {
        setDeleting(true);
        const result = await testCaseService.deleteTestCase(testCase.id);
        setDeleting(false);
        if (result.success) {
            toast.success('Test case deleted.');
            setShowDelete(false);
            onDeleted();
        } else {
            toast.error(result.error || 'Failed to delete test case.');
        }
    };

    // Keyboard shortcuts: Esc→Back, Ctrl/⌘+E→Edit, Ctrl/⌘+D→Duplicate, Alt+←/→→prev/next.
    // Ignored while typing in a field, and Esc is skipped while any modal/dialog is open.
    useEffect(() => {
        const anyModalOpen = showEdit || showDelete;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (!anyModalOpen) handleBack();
                return;
            }
            const target = e.target as HTMLElement | null;
            const tag = target?.tagName;
            const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!target?.isContentEditable;
            if (typing) return;

            const key = e.key.toLowerCase();
            if ((e.ctrlKey || e.metaKey) && key === 'e') {
                e.preventDefault();
                setShowEdit(true);
            } else if ((e.ctrlKey || e.metaKey) && key === 'd') {
                e.preventDefault();
                handleDuplicate();
            } else if (e.altKey && e.key === 'ArrowLeft' && prevId) {
                e.preventDefault();
                router.push(detailsPath(prevId));
            } else if (e.altKey && e.key === 'ArrowRight' && nextId) {
                e.preventDefault();
                router.push(detailsPath(nextId));
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showEdit, showDelete, prevId, nextId, testCase.id]);

    return (
        <>
            <DetailsHeader
                tc={testCase}
                hasPrev={!!prevId}
                hasNext={!!nextId}
                onBack={handleBack}
                onPrev={() => prevId && router.push(detailsPath(prevId))}
                onNext={() => nextId && router.push(detailsPath(nextId))}
                onEdit={() => setShowEdit(true)}
                onAssign={() => setShowEdit(true)}
                onDuplicate={handleDuplicate}
                onExport={handleExport}
                onDelete={() => setShowDelete(true)}
                onQuickStatus={handleQuickStatus}
            />

            <div className="space-y-6 mt-6">
                <DetailsSummaryCards tc={testCase} />

                <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-6 items-start">
                    <DetailsSectionNav />
                    <div className="space-y-6 min-w-0">
                        <OverviewSection tc={testCase} />
                        <DescriptionSection tc={testCase} />
                        <TestStepsSection tc={testCase} />
                        <ExpectedResultsSection tc={testCase} />
                        <ExecutionSection tc={testCase} />
                        <RelatedBugsSection tc={testCase} />
                        <CommentsSection tc={testCase} />
                        <AttachmentsSection />
                        <AIInsightsSection />
                        <HistorySection history={history} />
                    </div>
                </div>
            </div>

            {/* Mobile floating action bar */}
            <div className="lg:hidden sticky bottom-0 z-20 -mx-8 px-4 py-2 mt-6 bg-white/90 backdrop-blur border-t border-[#E2E8F0] flex items-center gap-2 overflow-x-auto">
                <button
                    onClick={() => setShowEdit(true)}
                    className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-white border border-[#E2E8F0] text-[#0F172A] text-xs font-semibold whitespace-nowrap"
                >
                    <Pencil className="w-4 h-4" /> Edit
                </button>
                <button onClick={handleDuplicate} disabled={duplicating} className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-white border border-[#E2E8F0] text-[#64748B] whitespace-nowrap disabled:opacity-50">
                    <Copy className="w-4 h-4" />
                </button>
                <button onClick={handleExport} className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-white border border-[#E2E8F0] text-[#64748B] whitespace-nowrap">
                    <Download className="w-4 h-4" />
                </button>
                <button onClick={() => setShowDelete(true)} className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-[#DC2626] whitespace-nowrap ml-auto">
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>

            {showEdit && (
                <TestCaseEditModal
                    testCase={testCase}
                    onClose={() => setShowEdit(false)}
                    onSaved={() => {
                        setShowEdit(false);
                        onReload();
                    }}
                />
            )}

            {showDelete && (
                <ConfirmDialog
                    title="Delete Test Case"
                    entity={testCase.tcId}
                    message={`Permanently delete "${testCase.name}"? This action cannot be undone.`}
                    confirmLabel="Delete"
                    loading={deleting}
                    onConfirm={handleDelete}
                    onClose={() => !deleting && setShowDelete(false)}
                />
            )}
        </>
    );
}
