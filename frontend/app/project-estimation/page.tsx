'use client';

/**
 * Project Estimation — the single workspace for everything estimation (scoped to the globally
 * selected project). One sidebar entry; every view is a tab here:
 *
 *   Overview · Module Breakdown · Estimations · My Estimations · Review Queue · Approved · Capacity
 *
 * My Estimations / Review Queue / Approved are client-side slices of the already-loaded estimations
 * list (no extra API calls) — see `mine` / `queue` / `approved` below. The active tab is URL-driven
 * (`?tab=…`) so the legacy sub-routes (my-estimations / review-queue / approved) can redirect here.
 *
 * Scoping follows the app convention (see ProjectContext): the current project is the global
 * selection, not a URL param. Metrics come straight from the API — never recomputed here.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Calculator, Plus, RefreshCw, Loader2, Layers, LayoutDashboard, Users, ClipboardList, Gauge, ListChecks, ClipboardCheck, CheckCircle2, AlertCircle } from 'lucide-react';
import { AppShell, PageContainer } from '@/components/layout';
import { Button, Tabs, TabPanel, Badge } from '@/components/core';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { useModuleProject } from '@/features/project-management/hooks/useModuleProject';
import { ModuleProjectSelector } from '@/features/project-management/components/ModuleProjectSelector';
import { useAuth } from '@/features/auth/AuthContext';
import { estimationService } from '@/features/project-estimation/services/estimation.service';
import { EstimationSummaryCards } from '@/features/project-estimation/components/EstimationSummaryCards';
import { ModuleBreakdownTable } from '@/features/project-estimation/components/ModuleBreakdownTable';
import { ModuleFormModal } from '@/features/project-estimation/components/ModuleFormModal';
import { EstimationFormModal } from '@/features/project-estimation/components/EstimationFormModal';
import { EstimationListTable, type WorkflowAction } from '@/features/project-estimation/components/EstimationListTable';
import { ComparisonModal } from '@/features/project-estimation/components/ComparisonModal';
import { ReviewHistoryModal } from '@/features/project-estimation/components/ReviewHistoryModal';
import { CapacityBarChart } from '@/features/project-estimation/components/CapacityBarChart';
import { CapacityGaugeChart } from '@/features/project-estimation/components/CapacityGaugeChart';
import { UtilizationLineChart } from '@/features/project-estimation/components/UtilizationLineChart';
import type {
    EstimationModule,
    EstimationProjectSummary,
    CapacityReport,
    ModuleEstimation,
    ProjectVersion,
} from '@/features/project-estimation/types';

function utilizationVariant(pct: number | null) {
    if (pct == null) return 'default';
    if (pct > 100) return 'error';
    if (pct > 85) return 'warning';
    return 'success';
}

export default function EstimationWorkspacePage() {
    // useSearchParams() must sit inside a <Suspense> boundary (Next 16 build requirement).
    return (
        <Suspense fallback={
            <AppShell><PageContainer>
                <div className="flex flex-col items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 text-[#06B6D4] animate-spin mb-3" />
                    <p className="text-sm text-[#64748B]">Loading estimation workspace…</p>
                </div>
            </PageContainer></AppShell>
        }>
            <EstimationWorkspace />
        </Suspense>
    );
}

function EstimationWorkspace() {
    const { projects, selectedProject, setSelectedProject, loading: projectsLoading } = useModuleProject('project-estimation');
    const { user } = useAuth();
    const toast = useToast();
    const projectId = selectedProject?.id ?? null;

    const [summary, setSummary] = useState<EstimationProjectSummary | null>(null);
    const [modules, setModules] = useState<EstimationModule[]>([]);
    const [estimations, setEstimations] = useState<ModuleEstimation[]>([]);
    const [versions, setVersions] = useState<ProjectVersion[]>([]);
    const [capacity, setCapacity] = useState<CapacityReport | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    const router = useRouter();
    const searchParams = useSearchParams();

    const [showModuleModal, setShowModuleModal] = useState(false);
    const [estimateFor, setEstimateFor] = useState<EstimationModule | null>(null);
    const [compareFor, setCompareFor] = useState<EstimationModule | null>(null);
    const [historyFor, setHistoryFor] = useState<{ id: string; label: string } | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);

    const role = user?.role;
    const canReview = role === 'admin' || role === 'qa_lead';
    const moduleNameOf = (id: string) => modules.find((m) => m.id === id)?.name ?? 'Unknown module';

    // URL-driven tab so the legacy sub-routes can deep-link in and a refresh keeps state.
    const allowedTabs = useMemo(() => {
        const ids = ['overview', 'modules', 'estimations', 'my-estimations'];
        if (canReview) ids.push('review-queue');
        ids.push('approved', 'capacity');
        return ids;
    }, [canReview]);
    const tabParam = searchParams.get('tab');
    const tab = tabParam && allowedTabs.includes(tabParam) ? tabParam : 'overview';
    const changeTab = useCallback((next: string) => {
        const params = new URLSearchParams(Array.from(searchParams.entries()));
        if (next === 'overview') params.delete('tab'); else params.set('tab', next);
        const qs = params.toString();
        router.replace(qs ? `/project-estimation?${qs}` : '/project-estimation', { scroll: false });
    }, [router, searchParams]);

    const loadAll = useCallback(async (id: string, initial = false) => {
        if (initial) setLoading(true);
        setError(false);
        try {
            const [sum, mods, ests, vers, cap] = await Promise.all([
                estimationService.getSummary(id),
                estimationService.listModules(id),
                estimationService.listEstimations(id),
                estimationService.listVersions(id),
                estimationService.getCapacity(id),
            ]);
            if (sum.success && sum.data) setSummary(sum.data);
            setModules(mods.success && mods.data ? mods.data : []);
            setEstimations(ests.success && ests.data ? ests.data : []);
            setVersions(vers.success && vers.data ? vers.data : []);
            setCapacity(cap.success && cap.data ? cap.data : null);
        } catch {
            // A thrown fetch is an ERROR (retry), not an empty workspace.
            setError(true);
        } finally {
            if (initial) setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!projectId) {
            setSummary(null); setModules([]); setEstimations([]); setVersions([]); setCapacity(null);
            setError(false);
            return;
        }
        loadAll(projectId, true);
    }, [projectId, loadAll]);

    const refresh = useCallback(async () => {
        if (!projectId) return;
        setRefreshing(true);
        await loadAll(projectId);
        setRefreshing(false);
    }, [projectId, loadAll]);

    const estimationsByModule = useMemo(() => {
        const map: Record<string, ModuleEstimation[]> = {};
        for (const e of estimations) {
            (map[e.moduleId] ??= []).push(e);
        }
        return map;
    }, [estimations]);

    // Three slices of the already-loaded estimations list — no extra API calls. Mirrors the backend
    // definitions exactly: review-queue = Submitted/Under Review, approved = isFinalApproved.
    const mine = useMemo(
        () => (user ? estimations.filter((e) => e.engineerName === user.name || e.engineerId === user.id) : estimations),
        [estimations, user],
    );
    const queue = useMemo(
        () => estimations.filter((e) => e.status === 'Submitted' || e.status === 'Under Review'),
        [estimations],
    );
    const approved = useMemo(() => estimations.filter((e) => e.isFinalApproved), [estimations]);

    const tabs = useMemo(() => ([
        { id: 'overview', label: 'Overview', icon: <LayoutDashboard className="w-4 h-4" /> },
        { id: 'modules', label: 'Module Breakdown', icon: <Layers className="w-4 h-4" />, count: modules.length },
        { id: 'estimations', label: 'Estimations', icon: <ClipboardList className="w-4 h-4" />, count: estimations.length },
        { id: 'my-estimations', label: 'My Estimations', icon: <ListChecks className="w-4 h-4" />, count: mine.length },
        ...(canReview
            ? [{ id: 'review-queue', label: 'Review Queue', icon: <ClipboardCheck className="w-4 h-4" />, count: queue.length }]
            : []),
        { id: 'approved', label: 'Approved', icon: <CheckCircle2 className="w-4 h-4" />, count: approved.length },
        { id: 'capacity', label: 'Capacity', icon: <Gauge className="w-4 h-4" /> },
    ]), [modules.length, estimations.length, mine.length, canReview, queue.length, approved.length]);

    const handleSaved = useCallback(async () => {
        setShowModuleModal(false);
        setEstimateFor(null);
        toast.success('Saved successfully.');
        if (projectId) await loadAll(projectId);
    }, [projectId, loadAll, toast]);

    const handleAction = useCallback(async (action: WorkflowAction, est: ModuleEstimation, comment?: string) => {
        setBusyId(est.id);
        let res: { success: boolean; error?: string } | undefined;
        switch (action) {
            case 'submit': res = await estimationService.submit(est.id); break;
            case 'resubmit': res = await estimationService.resubmit(est.id); break;
            case 'approve': res = await estimationService.approve(est.id, comment); break;
            case 'request_revision': res = await estimationService.requestRevision(est.id, comment); break;
            case 'reject': res = await estimationService.reject(est.id, comment); break;
            case 'reopen': res = await estimationService.reopen(est.id); break;
            case 'select_final': res = await estimationService.selectFinal(est.id); break;
        }
        setBusyId(null);
        if (res?.success) {
            toast.success('Estimation updated.');
            if (projectId) await loadAll(projectId);
        } else {
            toast.error(res?.error || 'Action failed.');
        }
    }, [projectId, loadAll, toast]);

    // No project selected.
    if (!projectId) {
        return (
            <AppShell>
                <PageContainer>
                    <div className="bg-white rounded-2xl border border-[#E2E8F0]">
                        <EmptyState
                            icon={Layers}
                            title="Select a project"
                            description="Choose a project from the dropdown above to manage its effort estimation."
                        />
                    </div>
                </PageContainer>
            </AppShell>
        );
    }

    return (
        <AppShell>
            <PageContainer>
                <div className="space-y-6">
                    {/* Header */}
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div>
                            <h1 className="text-2xl font-bold text-[#0F172A] tracking-tight flex items-center gap-2.5">
                                <Calculator className="w-6 h-6 text-[#06B6D4]" />
                                Project Estimation
                            </h1>
                            <p className="text-sm text-[#64748B] mt-1">
                                {selectedProject?.projectName} — module-level effort estimation, capacity &amp; approval.
                            </p>
                        </div>
                        <div className="flex items-center gap-3">
                            <ModuleProjectSelector
                                projects={projects}
                                value={selectedProject?.projectName ?? null}
                                onChange={setSelectedProject}
                                loading={projectsLoading}
                            />
                            <Button variant="secondary" size="sm" onClick={refresh} disabled={refreshing}
                                leftIcon={refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}>
                                Refresh
                            </Button>
                            <Button size="sm" onClick={() => setShowModuleModal(true)} leftIcon={<Plus className="w-4 h-4" />}>
                                Add Module
                            </Button>
                        </div>
                    </div>

                    {loading ? (
                        <div role="status" aria-live="polite" className="flex flex-col items-center justify-center py-20">
                            <Loader2 className="w-8 h-8 text-[#06B6D4] animate-spin mb-3" />
                            <p className="text-sm text-[#64748B]">Loading estimation data…</p>
                        </div>
                    ) : error && !summary ? (
                        <div role="alert" className="flex flex-col items-center justify-center py-20 text-center">
                            <AlertCircle className="w-8 h-8 text-[#EF4444] mb-3" />
                            <p className="text-sm font-semibold text-[#1E293B] mb-1">Couldn&apos;t load estimation data</p>
                            <p className="text-sm text-[#64748B] mb-4">Something went wrong while fetching this project&apos;s estimates.</p>
                            <Button variant="secondary" size="sm" onClick={() => projectId && loadAll(projectId, true)} leftIcon={<RefreshCw className="w-4 h-4" />}>
                                Retry
                            </Button>
                        </div>
                    ) : (
                        <>
                            <Tabs
                                tabs={tabs}
                                activeTab={tab}
                                onChange={changeTab}
                            />

                            <TabPanel value="overview" activeTab={tab}>
                                <div className="space-y-6">
                                    <EstimationSummaryCards summary={summary} />
                                    <p className="text-sm text-[#64748B]">
                                        Capacity, workload distribution and utilization live in the <button className="text-[#06B6D4] font-semibold hover:underline" onClick={() => changeTab('capacity')}>Capacity</button> tab.
                                    </p>
                                </div>
                            </TabPanel>

                            <TabPanel value="modules" activeTab={tab}>
                                <ModuleBreakdownTable
                                    modules={modules}
                                    estimationsByModule={estimationsByModule}
                                    onAddEstimate={(m) => setEstimateFor(m)}
                                    onAddModule={() => setShowModuleModal(true)}
                                    onCompare={(m) => setCompareFor(m)}
                                />
                            </TabPanel>

                            <TabPanel value="estimations" activeTab={tab}>
                                <EstimationListTable
                                    estimations={estimations}
                                    moduleNameOf={moduleNameOf}
                                    role={role}
                                    onAction={handleAction}
                                    onHistory={(id, label) => setHistoryFor({ id, label })}
                                    busyId={busyId}
                                />
                            </TabPanel>

                            <TabPanel value="my-estimations" activeTab={tab}>
                                <EstimationListTable
                                    estimations={mine}
                                    moduleNameOf={moduleNameOf}
                                    role={role}
                                    emptyTitle="No estimations yet"
                                    emptyDescription="Add estimates from the Module Breakdown tab."
                                    onAction={handleAction}
                                    onHistory={(id, label) => setHistoryFor({ id, label })}
                                    busyId={busyId}
                                />
                            </TabPanel>

                            <TabPanel value="review-queue" activeTab={tab}>
                                <EstimationListTable
                                    estimations={queue}
                                    moduleNameOf={moduleNameOf}
                                    role={role}
                                    emptyTitle="Nothing to review"
                                    emptyDescription="Estimates move here once an engineer submits them for review."
                                    onAction={handleAction}
                                    onHistory={(id, label) => setHistoryFor({ id, label })}
                                    busyId={busyId}
                                />
                            </TabPanel>

                            <TabPanel value="approved" activeTab={tab}>
                                <EstimationListTable
                                    estimations={approved}
                                    moduleNameOf={moduleNameOf}
                                    role={role}
                                    emptyTitle="No approved estimates yet"
                                    emptyDescription="Final-approved estimates appear here once a Lead reviews and selects them."
                                    onAction={handleAction}
                                    onHistory={(id, label) => setHistoryFor({ id, label })}
                                    busyId={busyId}
                                />
                            </TabPanel>

                            <TabPanel value="capacity" activeTab={tab}>
                                <div className="space-y-6">
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                        <CapacityBarChart engineers={capacity?.engineers ?? []} />
                                        <CapacityGaugeChart utilizationPercent={capacity?.overallUtilizationPercent ?? null} />
                                    </div>
                                    <UtilizationLineChart byVersion={capacity?.byVersion ?? []} />

                                    {/* Engineer workload table */}
                                    <div className="bg-white rounded-2xl border border-[#E2E8F0] overflow-hidden">
                                        <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center gap-2">
                                            <Users className="w-4 h-4 text-[#06B6D4]" />
                                            <h2 className="text-sm font-semibold text-[#0F172A]">Engineer Workload</h2>
                                        </div>
                                        {(capacity?.engineers?.length ?? 0) === 0 ? (
                                            <EmptyState compact icon={Users} title="No engineers assigned yet"
                                                description="Assign engineers to modules to see workload and utilization." />
                                        ) : (
                                            <div className="overflow-x-auto">
                                                <table className="w-full">
                                                    <thead>
                                                        <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                                                            <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wider">Engineer</th>
                                                            <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wider">Assigned hrs</th>
                                                            <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wider">Capacity / day</th>
                                                            <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wider">Estimates</th>
                                                            <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wider">Utilization</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {(capacity?.engineers ?? []).map((w) => (
                                                            <tr key={w.engineerId} className="border-b border-[#E2E8F0] last:border-0 hover:bg-[#F8FAFC]">
                                                                <td className="px-4 py-3 font-medium text-[#0F172A]">{w.engineerName}</td>
                                                                <td className="px-4 py-3 text-right text-sm text-[#475569]">{Math.round(w.assignedHours * 100) / 100}</td>
                                                                <td className="px-4 py-3 text-right text-sm text-[#475569]">{w.dailyCapacityHours}</td>
                                                                <td className="px-4 py-3 text-right text-sm text-[#475569]">{w.estimationCount}</td>
                                                                <td className="px-4 py-3 text-right">
                                                                    <Badge variant={utilizationVariant(w.utilizationPercent)} size="sm">
                                                                        {w.utilizationPercent == null ? 'N/A' : `${w.utilizationPercent}%`}
                                                                    </Badge>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </TabPanel>
                        </>
                    )}
                </div>
            </PageContainer>

            {showModuleModal && (
                <ModuleFormModal
                    projectId={projectId}
                    versions={versions}
                    onClose={() => setShowModuleModal(false)}
                    onSaved={handleSaved}
                />
            )}

            {estimateFor && (
                <EstimationFormModal
                    module={estimateFor}
                    defaultEngineerName={user?.name}
                    onClose={() => setEstimateFor(null)}
                    onSaved={handleSaved}
                />
            )}

            {compareFor && (
                <ComparisonModal
                    moduleId={compareFor.id}
                    moduleName={compareFor.name}
                    canReview={canReview}
                    onClose={() => setCompareFor(null)}
                    onChanged={() => { if (projectId) loadAll(projectId); }}
                />
            )}

            {historyFor && (
                <ReviewHistoryModal
                    estimationId={historyFor.id}
                    label={historyFor.label}
                    onClose={() => setHistoryFor(null)}
                />
            )}
        </AppShell>
    );
}
