'use client';

/**
 * Test Case Management Page
 * Permanent repository for all generated test cases.
 * Tabs: Summary, Test Cases, Execution, Reports
 */

import { useState, useMemo, useEffect, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import {
    PieChart, Pie, Cell, BarChart, Bar, AreaChart, Area,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { AppShell, PageContainer } from '@/components/layout';
import { Button } from '@/components/core';
import { CustomSelect, type SelectOption } from '@/components/ui/CustomSelect';
import { Pagination, usePagination } from '@/components/ui/Pagination';
import { ChartCard } from '@/components/ui/ChartCard';
import { AdvancedTestCaseTable } from '@/features/test-case-generator/components/AdvancedTestCaseTable';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { EmptyTestCases, EmptySearch, EmptyState } from '@/components/states';
import { safeNumber } from '@/lib/safe-value';
import {
    ClipboardList, CheckCircle, XCircle, Ban, Clock, RefreshCw, Download,
    Search, Loader2, Eye, Sparkles, TrendingUp,
    AlertTriangle, Target, BarChart3, Users, FileText, Link2, Layers,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import type {
    TestCase, TestCaseAnalytics, TestCaseStatus, TestCasePriority,
    ModuleNode, UpdateTestCaseInput,
} from '@/features/test-case-management/types';
import { testCaseService } from '@/features/test-case-management/services/test-case.service';
import { useModuleProject } from '@/features/project-management/hooks/useModuleProject';
import { ModuleProjectSelector } from '@/features/project-management/components/ModuleProjectSelector';
import { useAuth } from '@/features/auth/AuthContext';
import { projectService } from '@/features/project-management/services/project.service';
import type { ProjectMember } from '@/features/project-management/types';
import { InlineSelectCell } from '@/components/inline/InlineSelectCell';
import { InlineAssigneeCell } from '@/components/inline/InlineAssigneeCell';

type TabId = 'summary' | 'testCases' | 'reports';

const STATUS_COLORS: Record<TestCaseStatus, string> = {
    'Passed': '#22C55E',
    'Failed': '#EF4444',
    'Blocked': '#F97316',
    'Skipped': '#64748B',
    'Not Executed': '#94A3B8',
};

const PRIORITY_COLORS: Record<TestCasePriority, string> = {
    Critical: '#EF4444',
    High: '#F97316',
    Medium: '#F59E0B',
    Low: '#22C55E',
};

const STATUS_OPTIONS: TestCaseStatus[] = ['Not Executed', 'Passed', 'Failed', 'Blocked', 'Skipped'];

/** Read a JSON value from sessionStorage (SSR-safe). */
function readSession<T>(key: string, fallback: T): T {
    if (typeof window === 'undefined') return fallback;
    try {
        const raw = sessionStorage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
        return fallback;
    }
}

/** Write a JSON value to sessionStorage (no-op on SSR / private mode). */
function writeSession(key: string, value: unknown): void {
    if (typeof window === 'undefined') return;
    try {
        sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
        /* ignore */
    }
}

export default function TestManagementPage() {
    // useSearchParams() must sit inside a <Suspense> boundary (Next 16 build requirement).
    return (
        <Suspense fallback={
            <AppShell><PageContainer>
                <div className="flex flex-col items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 text-[#06B6D4] animate-spin mb-3" />
                    <p className="text-sm text-[#64748B]">Loading test management…</p>
                </div>
            </PageContainer></AppShell>
        }>
            <TestManagementWorkspace />
        </Suspense>
    );
}

function TestManagementWorkspace() {
    // This module owns its own project selection (per-module, persisted) — see useModuleProject.
    // The page never fabricates a project name and never fetches when none is selected.
    const { projects, selectedProjectName, setSelectedProject, loading: projectsLoading } = useModuleProject('test-management');
    const project = selectedProjectName;
    const toast = useToast();
    const router = useRouter();
    const searchParams = useSearchParams();

    // URL-driven tab so Back/refresh land on the same view.
    const tabParam = searchParams.get('tab') as TabId | null;
    const activeTab: TabId =
        tabParam && ['summary', 'testCases', 'reports'].includes(tabParam) ? tabParam : 'summary';
    const setActiveTab = useCallback((next: TabId) => {
        const params = new URLSearchParams(Array.from(searchParams.entries()));
        if (next === 'summary') params.delete('tab'); else params.set('tab', next);
        const qs = params.toString();
        router.replace(qs ? `/test-management?${qs}` : '/test-management', { scroll: false });
    }, [router, searchParams]);

    const [analytics, setAnalytics] = useState<TestCaseAnalytics | null>(null);
    const [testCases, setTestCases] = useState<TestCase[]>([]);
    const [moduleTree, setModuleTree] = useState<ModuleNode[]>([]);
    const [loading, setLoading] = useState(true);
    const { user } = useAuth();
    // Role drives inline-edit permissions (UI defense-in-depth; the backend is authoritative).
    // Unknown/no-session ⇒ admin (open in dev; the proxy + backend enforce in prod).
    const role = user?.role ?? 'admin';
    const [members, setMembers] = useState<ProjectMember[]>([]);
    // Key (`${tcId}:${field}`) of the inline cell currently saving — drives its spinner + revert.
    const [saving, setSaving] = useState<string | null>(null);

    // Navigate to the details page, preserving the list scroll position for Back.
    const goToDetails = useCallback((tc: TestCase) => {
        try {
            const scroller = document.querySelector('main');
            if (scroller) sessionStorage.setItem('tm.listScroll', String(scroller.scrollTop));
        } catch {
            /* ignore */
        }
        router.push(`/test-management/test-cases/${tc.id}`);
    }, [router]);

    const loadData = useCallback(async () => {
        // No project selected → clear everything and do not call the API.
        // (Prevents stale/fabricated project names from reaching the backend.)
        if (!project) {
            setAnalytics(null);
            setTestCases([]);
            setModuleTree([]);
            setMembers([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const [analyticsRes, casesRes, treeRes, membersRes] = await Promise.all([
                testCaseService.getTestCaseAnalytics(project),
                testCaseService.listTestCases({ projectName: project }),
                testCaseService.getModuleTree(project),
                projectService.getProjectMembers(project),
            ]);
            if (analyticsRes.success && analyticsRes.data) setAnalytics(analyticsRes.data);
            if (casesRes.success && casesRes.data) setTestCases(casesRes.data);
            if (treeRes.success && treeRes.data) setModuleTree(treeRes.data);
            setMembers(membersRes.data ?? []);
        } catch (err) {
            console.error('Failed to load test management data:', err);
            toast.error('Failed to load test management data.', { description: 'Please try refreshing the page.' });
        } finally {
            setLoading(false);
        }
    }, [project]);

    /**
     * Silent refresh — re-fetch analytics + cases + module tree + members WITHOUT toggling the full-page
     * loading spinner, so inline edits update the Summary KPIs/charts and the Assignee list without
     * disrupting the view. The server is the single source of truth (reporting-rules.md).
     */
    const refreshData = useCallback(async () => {
        if (!project) return;
        const [analyticsRes, casesRes, treeRes, membersRes] = await Promise.all([
            testCaseService.getTestCaseAnalytics(project),
            testCaseService.listTestCases({ projectName: project }),
            testCaseService.getModuleTree(project),
            projectService.getProjectMembers(project),
        ]);
        if (analyticsRes.success && analyticsRes.data) setAnalytics(analyticsRes.data);
        if (casesRes.success && casesRes.data) setTestCases(casesRes.data);
        if (treeRes.success && treeRes.data) setModuleTree(treeRes.data);
        setMembers(membersRes.data ?? []);
    }, [project]);

    /**
     * Inline update flow: optimistic local patch → PATCH → silent refresh on success / revert on error.
     * Execution status is editable by all; priority/assignee are Lead/Admin (the backend enforces it).
     */
    const handleInlineUpdate = useCallback(async (
        id: string,
        field: 'testStatus' | 'priority' | 'assignedTo',
        value: string,
    ) => {
        const key = `${id}:${field}`;
        const memberName = field === 'assignedTo' ? (members.find(m => m.id === value)?.name ?? '') : '';

        // 1. Optimistic local patch for immediate feedback.
        setTestCases(prev => prev.map(tc => {
            if (tc.id !== id) return tc;
            if (field === 'testStatus') return { ...tc, testStatus: value as TestCaseStatus };
            if (field === 'priority') return { ...tc, priority: value as TestCasePriority };
            return { ...tc, assignedToId: value, assignedTo: memberName || 'Unassigned' };
        }));

        // 2. Persist (single-field PATCH; change tracking + history happen server-side).
        setSaving(key);
        const updates: UpdateTestCaseInput = { changedBy: user?.name ?? 'QA Team' };
        if (field === 'testStatus') updates.testStatus = value as TestCaseStatus;
        else if (field === 'priority') updates.priority = value as TestCasePriority;
        else updates.assignedTo = value;

        const result = await testCaseService.updateTestCase(id, updates);
        setSaving(null);

        // 3. Success → silent refresh (syncs Summary KPIs/charts). Error → refresh reverts to server truth.
        if (result.success) {
            toast.success('Test case updated successfully.');
            refreshData();
        } else {
            toast.error(result.error || 'Unable to update test case. Please try again.');
            refreshData();
        }
    }, [members, user, refreshData, toast]);

    useEffect(() => {
        // loadData is async with setState after await (safe); the rule can't trace through the
        // memoized callback, so this one-time mount fetch is fine.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadData();
    }, [loadData]);

    // Restore the list scroll position when returning from a details page (one-shot, after load).
    useEffect(() => {
        if (loading) return;
        try {
            const saved = sessionStorage.getItem('tm.listScroll');
            if (saved !== null) {
                const scroller = document.querySelector('main');
                if (scroller) scroller.scrollTop = Number(saved);
                sessionStorage.removeItem('tm.listScroll');
            }
        } catch {
            /* ignore */
        }
    }, [loading]);

    const handleExportExcel = () => {
        // Standard 12-column format (matches the Generated view + CSV): Module · TC ID · TC Name ·
        // Priority · Test Steps · Expected Results · Test Status · Actual Result · Assigned To ·
        // Execution Date · Related Bugs · Comments.
        const wb = XLSX.utils.book_new();
        const sheetData = [
            ['Module', 'TC ID', 'TC Name', 'Priority', 'Test Steps', 'Expected Results', 'Test Status', 'Actual Result', 'Assigned To', 'Execution Date', 'Related Bugs', 'Comments'],
            ...testCases.map(tc => [
                tc.module, tc.tcId, tc.name, tc.priority,
                (tc.testSteps || []).join('\n'),
                tc.expectedResult || '',
                tc.testStatus, tc.actualResult || 'N/A', tc.assignedTo,
                tc.executionDate ? new Date(tc.executionDate).toLocaleDateString() : '',
                (tc.relatedBugs || []).join(', '),
                tc.comments || 'N/A',
            ]),
        ];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheetData), 'Test Cases');
        XLSX.writeFile(wb, `${(project ?? 'TestCases').replace(/\s/g, '_')}_TestCases.xlsx`);
    };

    return (
        <AppShell>
            <PageContainer>
                <div className="space-y-6">
                    {/* Header */}
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div>
                            <h1 className="text-2xl font-bold text-[#0F172A] tracking-tight">Test Case Management</h1>
                            <p className="text-sm text-[#64748B] mt-1">Permanent QA repository — organize, execute, and track test cases</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <ModuleProjectSelector
                                projects={projects}
                                value={selectedProjectName}
                                onChange={setSelectedProject}
                                loading={projectsLoading}
                            />
                            <Button variant="secondary" size="sm" onClick={loadData} disabled={loading || !project}>
                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                Refresh
                            </Button>
                            <Button variant="secondary" size="sm" onClick={handleExportExcel} disabled={!project} leftIcon={<Download className="w-4 h-4" />}>
                                Export
                            </Button>
                        </div>
                    </div>

                    {/* No Project Selected */}
                    {!project ? (
                        <div className="flex flex-col items-center justify-center py-20">
                            <div className="w-14 h-14 rounded-2xl bg-[#F1F5F9] flex items-center justify-center mb-4">
                                <ClipboardList className="w-7 h-7 text-[#94A3B8]" />
                            </div>
                            <p className="text-base font-semibold text-[#1E293B] mb-1">No project selected</p>
                            <p className="text-sm text-[#64748B]">Choose a project from the dropdown above to view its test cases.</p>
                        </div>
                    ) : loading ? (
                        <div className="flex flex-col items-center justify-center py-20">
                            <Loader2 className="w-8 h-8 text-[#06B6D4] animate-spin mb-3" />
                            <p className="text-sm text-[#64748B]">Loading test case data...</p>
                        </div>
                    ) : !analytics ? (
                        <div className="flex flex-col items-center justify-center py-20">
                            <AlertTriangle className="w-8 h-8 text-[#F59E0B] mb-3" />
                            <p className="text-sm text-[#64748B] mb-4">Failed to load analytics data.</p>
                            <Button variant="secondary" size="sm" onClick={loadData} leftIcon={<RefreshCw className="w-4 h-4" />}>
                                Retry
                            </Button>
                        </div>
                    ) : (
                        <>
                            {/* Tabs */}
                            <div className="flex items-center gap-1 bg-[#F1F5F9] rounded-xl p-1 w-fit">
                                <TabButton active={activeTab === 'summary'} onClick={() => setActiveTab('summary')} icon={<BarChart3 className="w-4 h-4" />}>Summary</TabButton>
                                <TabButton active={activeTab === 'testCases'} onClick={() => setActiveTab('testCases')} icon={<ClipboardList className="w-4 h-4" />}>Test Cases</TabButton>
                                <TabButton active={activeTab === 'reports'} onClick={() => setActiveTab('reports')} icon={<FileText className="w-4 h-4" />}>Reports</TabButton>
                            </div>

                            {activeTab === 'summary' && <SummaryView analytics={analytics} />}
                            {activeTab === 'testCases' && (
                                <TestCasesView
                                    testCases={testCases}
                                    moduleTree={moduleTree}
                                    projectName={project}
                                    onViewTestCase={goToDetails}
                                    onInlineUpdate={handleInlineUpdate}
                                    onRefresh={loadData}
                                    members={members}
                                    role={role}
                                    currentUserId={user?.id}
                                    savingKey={saving}
                                />
                            )}
                            {activeTab === 'reports' && <ReportsView analytics={analytics} testCases={testCases} onExport={handleExportExcel} />}
                        </>
                    )}

                    {/* Test case details now live on their own page (/test-management/test-cases/[id]). */}
                </div>
            </PageContainer>
        </AppShell>
    );
}

/* ═══════════════════════════════════════════════════ */
/* ═══ SUMMARY VIEW ══════════════════════════════════ */
/* ═══════════════════════════════════════════════════ */

function SummaryView({ analytics }: { analytics: TestCaseAnalytics }) {
    const statusPieData = [
        { name: 'Passed', value: analytics.passed, color: STATUS_COLORS['Passed'] },
        { name: 'Failed', value: analytics.failed, color: STATUS_COLORS['Failed'] },
        { name: 'Blocked', value: analytics.blocked, color: STATUS_COLORS['Blocked'] },
        { name: 'Not Executed', value: analytics.notExecuted, color: STATUS_COLORS['Not Executed'] },
        { name: 'Skipped', value: analytics.skipped, color: STATUS_COLORS['Skipped'] },
    ].filter(d => d.value > 0);

    const moduleBarData = analytics.moduleCoverage.slice(0, 8).map(m => ({
        module: m.module.length > 12 ? m.module.slice(0, 12) + '…' : m.module,
        total: m.total,
        passed: m.passed,
        failed: m.failed,
    }));

    const priorityBarData = analytics.priorityDistribution.map(p => ({
        priority: p.priority,
        count: p.count,
        color: PRIORITY_COLORS[p.priority],
    }));

    return (
        <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
                <KPICard icon={<ClipboardList />} label="Total" value={safeNumber(analytics.totalCases)} color="#3B82F6" bgColor="#EFF6FF" />
                <KPICard icon={<Clock />} label="Not Executed" value={safeNumber(analytics.notExecuted)} color="#94A3B8" bgColor="#F1F5F9" />
                <KPICard icon={<CheckCircle />} label="Passed" value={safeNumber(analytics.passed)} color="#22C55E" bgColor="#F0FDF4" />
                <KPICard icon={<XCircle />} label="Failed" value={safeNumber(analytics.failed)} color="#EF4444" bgColor="#FEF2F2" />
                <KPICard icon={<Ban />} label="Blocked" value={safeNumber(analytics.blocked)} color="#F97316" bgColor="#FFF7ED" />
                <KPICard icon={<TrendingUp />} label="Pass Rate" value={`${safeNumber(analytics.passRate)}%`} color="#06B6D4" bgColor="#ECFEFF" />
                <KPICard icon={<Link2 />} label="Linked Bugs" value={safeNumber(analytics.linkedBugs)} color="#8B5CF6" bgColor="#F5F3FF" />
                <KPICard icon={<Layers />} label="Modules" value={safeNumber(analytics.modulesCovered)} color="#0EA5E9" bgColor="#F0F9FF" />
            </div>

            {/* Status Distribution + Module Coverage */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ChartCard title="Test Case Status Distribution" icon={<PieChart className="w-5 h-5" />} data={statusPieData} height={280}>
                    <ResponsiveContainer width="100%" height={280}>
                        <PieChart>
                            <Pie data={statusPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={50}
                                label={({ name, value }) => `${name}: ${value}`}>
                                {statusPieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                            </Pie>
                            <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 13 }} />
                        </PieChart>
                    </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Module Coverage" icon={<BarChart3 className="w-5 h-5" />} data={moduleBarData} height={280}>
                    <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={moduleBarData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                            <XAxis dataKey="module" tick={{ fontSize: 10, fill: '#64748B' }} angle={-20} textAnchor="end" height={60} />
                            <YAxis tick={{ fontSize: 12, fill: '#64748B' }} />
                            <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 13 }} />
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                            <Bar dataKey="passed" stackId="a" fill="#22C55E" radius={[0, 0, 0, 0]} />
                            <Bar dataKey="failed" stackId="a" fill="#EF4444" />
                            <Bar dataKey="total" stackId="a" fill="#E2E8F0" radius={[8, 8, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </ChartCard>
            </div>

            {/* Priority Distribution + Execution Trend */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ChartCard title="Priority Distribution" icon={<AlertTriangle className="w-5 h-5" />} data={priorityBarData} height={250}>
                    <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={priorityBarData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                            <XAxis dataKey="priority" tick={{ fontSize: 12, fill: '#64748B' }} />
                            <YAxis tick={{ fontSize: 12, fill: '#64748B' }} />
                            <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 13 }} />
                            <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                                {priorityBarData.map((e, i) => <Cell key={i} fill={e.color} />)}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Execution Trend (Last 7 Days)" icon={<TrendingUp className="w-5 h-5" />} data={analytics.executionTrend} height={250}>
                    <ResponsiveContainer width="100%" height={250}>
                        <AreaChart data={analytics.executionTrend}>
                            <defs>
                                <linearGradient id="execGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#06B6D4" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#06B6D4" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748B' }} tickFormatter={v => v.slice(5)} />
                            <YAxis tick={{ fontSize: 12, fill: '#64748B' }} />
                            <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 13 }} />
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                            <Area type="monotone" dataKey="executed" stroke="#06B6D4" strokeWidth={2} fill="url(#execGrad)" name="Executed" />
                            <Area type="monotone" dataKey="passed" stroke="#22C55E" strokeWidth={2} fill="none" name="Passed" />
                            <Area type="monotone" dataKey="failed" stroke="#EF4444" strokeWidth={2} fill="none" name="Failed" />
                        </AreaChart>
                    </ResponsiveContainer>
                </ChartCard>
            </div>

            {/* AI Insights */}
            <div className="bg-gradient-to-br from-[#0F172A] to-[#1E293B] rounded-2xl p-6 text-white">
                <div className="flex items-center gap-2 mb-5">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#06B6D4] to-[#3B82F6] flex items-center justify-center">
                        <Sparkles className="w-4 h-4 text-white" />
                    </div>
                    <h3 className="text-base font-semibold">AI Test Coverage Insights</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-[#EF4444]/10 rounded-xl p-4 border border-[#EF4444]/20">
                        <div className="flex items-center gap-2 mb-2">
                            <AlertTriangle className="w-4 h-4 text-[#F87171]" />
                            <span className="text-xs font-semibold text-[#94A3B8] uppercase">Most Untested Module</span>
                        </div>
                        <p className="text-sm font-semibold mb-1">{analytics.aiInsights.mostUntestedModule}</p>
                        <p className="text-xs text-[#94A3B8]">{analytics.aiInsights.remainingCases} cases remaining</p>
                    </div>
                    <div className="bg-[#F97316]/10 rounded-xl p-4 border border-[#F97316]/20">
                        <div className="flex items-center gap-2 mb-2">
                            <Target className="w-4 h-4 text-[#FB923C]" />
                            <span className="text-xs font-semibold text-[#94A3B8] uppercase">Lowest Pass Rate</span>
                        </div>
                        <p className="text-sm font-semibold mb-1">{analytics.aiInsights.lowestPassRateModule}</p>
                        <p className="text-xs text-[#94A3B8]">{analytics.aiInsights.lowestPassRate}% pass rate</p>
                    </div>
                    <div className="bg-[#22C55E]/10 rounded-xl p-4 border border-[#22C55E]/20">
                        <div className="flex items-center gap-2 mb-2">
                            <CheckCircle className="w-4 h-4 text-[#4ADE80]" />
                            <span className="text-xs font-semibold text-[#94A3B8] uppercase">Overall Pass Rate</span>
                        </div>
                        <p className="text-sm font-semibold mb-1">{analytics.passRate}%</p>
                        <p className="text-xs text-[#94A3B8]">{analytics.passed} passed of {analytics.passed + analytics.failed + analytics.blocked + analytics.skipped} executed</p>
                    </div>
                </div>
            </div>
        </>
    );
}

/* ═══════════════════════════════════════════════════ */
/* ═══ TEST CASES VIEW ═══════════════════════════════ */
/* ═══════════════════════════════════════════════════ */

function TestCasesView({
    testCases, moduleTree, projectName, onViewTestCase, onRefresh, onInlineUpdate, members, role, currentUserId, savingKey,
}: {
    testCases: TestCase[];
    moduleTree: ModuleNode[];
    projectName: string;
    onViewTestCase: (tc: TestCase) => void;
    onRefresh: () => void;
    onInlineUpdate: (id: string, field: 'testStatus' | 'priority' | 'assignedTo', value: string) => void;
    members: ProjectMember[];
    role: 'admin' | 'qa_lead' | 'qa_engineer';
    currentUserId?: string;
    savingKey: string | null;
}) {
    const toast = useToast();
    const [selectedModule, setSelectedModule] = useState<string | null>(() => readSession<{ module: string | null }>('tm.tcFilters', { module: null }).module);
    const [moduleToDelete, setModuleToDelete] = useState<{ name: string; count: number } | null>(null);
    const [deletingModule, setDeletingModule] = useState(false);
    const [search, setSearch] = useState<string>(() => readSession<{ search: string }>('tm.tcFilters', { search: '' }).search);
    const [statusFilter, setStatusFilter] = useState<string>(() => readSession<{ status: string }>('tm.tcFilters', { status: 'All' }).status);
    const [priorityFilter, setPriorityFilter] = useState<string>(() => readSession<{ priority: string }>('tm.tcFilters', { priority: 'All' }).priority);

    // Persist the filter set so Back/refresh restore the exact table state.
    useEffect(() => {
        writeSession('tm.tcFilters', { module: selectedModule, search, status: statusFilter, priority: priorityFilter });
    }, [selectedModule, search, statusFilter, priorityFilter]);

    const filteredCases = useMemo(() => {
        return testCases.filter(tc => {
            if (selectedModule && tc.module !== selectedModule) return false;
            if (statusFilter !== 'All' && tc.testStatus !== statusFilter) return false;
            if (priorityFilter !== 'All' && tc.priority !== priorityFilter) return false;
            if (search) {
                const q = search.toLowerCase();
                if (!tc.name.toLowerCase().includes(q) && !tc.tcId.toLowerCase().includes(q) && !tc.module.toLowerCase().includes(q)) return false;
            }
            return true;
        });
    }, [testCases, selectedModule, statusFilter, priorityFilter, search]);

    // Whether any module/status/priority/search filter is active — drives empty-state copy.
    const hasActiveFilters = !!selectedModule || statusFilter !== 'All' || priorityFilter !== 'All' || !!search;
    const clearFilters = () => { setSelectedModule(null); setStatusFilter('All'); setPriorityFilter('All'); setSearch(''); };

    const handleDeleteModule = async () => {
        if (!moduleToDelete) return;
        setDeletingModule(true);
        const result = await testCaseService.deleteModule(projectName, moduleToDelete.name);
        setDeletingModule(false);
        if (result.success) {
            toast.success(`Deleted module “${moduleToDelete.name}” (${moduleToDelete.count} test case${moduleToDelete.count === 1 ? '' : 's'}).`);
            // Clear the filter if the deleted module was active, then refresh every impacted area
            // (analytics, the case list, and the module tree) via the parent's loadData().
            if (selectedModule === moduleToDelete.name) setSelectedModule(null);
            setModuleToDelete(null);
            onRefresh();
        } else {
            toast.error(result.error || 'Failed to delete module.');
        }
    };

    // Pagination over the filtered list; resets to page 1 when filters change.
    const filterKey = `${selectedModule ?? ''}|${statusFilter}|${priorityFilter}|${search}`;
    const {
        page, pageSize, setPage, setPageSize,
        totalPages, totalItems, startIdx, endIdx,
        paginatedItems: paginatedCases,
    } = usePagination(filteredCases, 10, filterKey);

    // Restore the page when returning from a details page (one-shot, after usePagination's reset).
    const tcPageRestored = useRef(false);
    useEffect(() => {
        if (tcPageRestored.current) return;
        tcPageRestored.current = true;
        const restored = readSession<number>('tm.tcPage', 1);
        if (restored > 1) setPage(restored);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    useEffect(() => {
        writeSession('tm.tcPage', page);
    }, [page]);

    // ── Inline-editable cells (opt-in overrides for the shared table) ──
    // Execution status is editable by all roles; Priority + Assigned To are Lead/Admin only (the backend
    // enforces it; for other roles these columns fall back to the table's default read-only render).
    const canEditClassified = role === 'admin' || role === 'qa_lead';
    const isSaving = (tcId: string, field: string) => savingKey === `${tcId}:${field}`;
    const editableCells: Partial<Record<string, (tc: TestCase) => React.ReactNode>> = {
        testStatus: (tc) => (
            <InlineSelectCell
                value={tc.testStatus}
                options={STATUS_OPTIONS.map(s => ({ value: s, label: s, icon: <Dot color={STATUS_COLORS[s]} /> }))}
                accentColor={STATUS_COLORS[tc.testStatus]}
                loading={isSaving(tc.id, 'testStatus')}
                onChange={(v) => onInlineUpdate(tc.id, 'testStatus', v)}
            />
        ),
        ...(canEditClassified ? {
            priority: (tc: TestCase) => (
                <InlineSelectCell
                    value={tc.priority}
                    options={(['Critical', 'High', 'Medium', 'Low'] as TestCasePriority[]).map(p => ({ value: p, label: p, icon: <Dot color={PRIORITY_COLORS[p]} /> }))}
                    accentColor={PRIORITY_COLORS[tc.priority]}
                    loading={isSaving(tc.id, 'priority')}
                    onChange={(v) => onInlineUpdate(tc.id, 'priority', v)}
                />
            ),
            assignedTo: (tc: TestCase) => (
                <InlineAssigneeCell
                    assigneeId={tc.assignedToId || ''}
                    assigneeName={tc.assignedTo}
                    members={members}
                    loading={isSaving(tc.id, 'assignedTo')}
                    onChange={(v) => onInlineUpdate(tc.id, 'assignedTo', v)}
                />
            ),
        } : {}),
    };

    return (
        <div className="space-y-4">
            {/* Toolbar — full width */}
            <div className="bg-white rounded-2xl border border-[#E2E8F0] p-4 space-y-4">
                {/* Search + Status + Priority */}
                <div className="flex items-center gap-3 flex-wrap">
                    <div className="relative flex-1 min-w-[220px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search by TC ID, name, or module..."
                            className="w-full pl-9 pr-4 h-10 rounded-xl border border-[#E2E8F0] text-sm text-[#1E293B] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#06B6D4]/20 focus:border-[#06B6D4]"
                        />
                    </div>
                    <FilterDropdown label="Status" value={statusFilter} options={['All', ...STATUS_OPTIONS]} onChange={setStatusFilter} />
                    <FilterDropdown label="Priority" value={priorityFilter} options={['All', 'Critical', 'High', 'Medium', 'Low']} onChange={setPriorityFilter} />
                </div>

                {/* Module filter chips — only show modules that have test cases */}
                <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-[#64748B] uppercase tracking-wider flex items-center gap-1.5 flex-shrink-0">
                        <Layers className="w-3.5 h-3.5" /> Modules
                    </span>
                    <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1 flex-1 min-w-0">
                        <button
                            onClick={() => setSelectedModule(null)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors ${selectedModule === null ? 'bg-[#06B6D4] text-white shadow-sm' : 'bg-[#F1F5F9] text-[#1E293B] hover:bg-[#E2E8F0]'}`}
                        >
                            All
                            <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${selectedModule === null ? 'bg-white/20 text-white' : 'bg-white text-[#64748B]'}`}>{testCases.length}</span>
                        </button>
                        {moduleTree.filter(node => node.totalCount > 0).map(node => {
                            const active = selectedModule === node.module;
                            return (
                                <div key={node.module} className="group inline-flex items-stretch rounded-lg flex-shrink-0 overflow-hidden">
                                    <button
                                        onClick={() => setSelectedModule(active ? null : node.module)}
                                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${active ? 'bg-[#06B6D4] text-white' : 'bg-[#F1F5F9] text-[#1E293B] hover:bg-[#E2E8F0]'}`}
                                    >
                                        {node.module}
                                        <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${active ? 'bg-white/20 text-white' : 'bg-white text-[#64748B]'}`}>{node.totalCount}</span>
                                    </button>
                                    <button
                                        title={`Delete module "${node.module}"`}
                                        onClick={(e) => { e.stopPropagation(); setModuleToDelete({ name: node.module, count: node.totalCount }); }}
                                        className={`inline-flex items-center justify-center px-2 text-xs transition-colors ${active ? 'bg-[#06B6D4] text-white hover:bg-[#0891B2]' : 'bg-[#F1F5F9] text-[#94A3B8] hover:text-[#EF4444] hover:bg-[#FEF2F2]'} opacity-60 group-hover:opacity-100`}
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Table — shared 12-column test-case table (consistent across the portal) */}
            {filteredCases.length > 0 ? (
                <AdvancedTestCaseTable testCases={paginatedCases} onRowClick={onViewTestCase} editableCells={editableCells} />
            ) : (
                <div className="bg-white rounded-2xl border border-[#E2E8F0] px-4 py-10">
                    {hasActiveFilters ? <EmptySearch onClear={clearFilters} /> : <EmptyTestCases />}
                </div>
            )}

            {/* Pagination Footer */}
            {filteredCases.length > 0 && (
                <Pagination
                    page={page}
                    totalPages={totalPages}
                    totalItems={totalItems}
                    startIdx={startIdx}
                    endIdx={endIdx}
                    pageSize={pageSize}
                    onPageChange={setPage}
                    onPageSizeChange={setPageSize}
                    rangeSuffix={selectedModule ? <span className="text-[#06B6D4]"> in {selectedModule}</span> : undefined}
                />
            )}

            {/* Delete-whole-module confirmation (global, consistent warning card) */}
            {moduleToDelete && (
                <ConfirmDialog
                    title="Delete Module"
                    entity={moduleToDelete.name}
                    message={`This permanently removes all ${moduleToDelete.count} test case${moduleToDelete.count === 1 ? '' : 's'} in this module from the project. This action cannot be undone.`}
                    confirmLabel="Delete Module"
                    loading={deletingModule}
                    onConfirm={handleDeleteModule}
                    onClose={() => !deletingModule && setModuleToDelete(null)}
                />
            )}
        </div>
    );
}

/* ═══════════════════════════════════════════════════ */
/* ═══ REPORTS VIEW ══════════════════════════════════ */
/* ═══════════════════════════════════════════════════ */

function ReportsView({ analytics, testCases, onExport }: { analytics: TestCaseAnalytics; testCases: TestCase[]; onExport: () => void }) {
    // Tester report
    const testerStats = useMemo(() => {
        const map = new Map<string, { assigned: number; passed: number; failed: number; blocked: number }>();
        for (const tc of testCases) {
            const tester = tc.assignedTo || 'Unassigned';
            if (!map.has(tester)) map.set(tester, { assigned: 0, passed: 0, failed: 0, blocked: 0 });
            const s = map.get(tester)!;
            s.assigned++;
            if (tc.testStatus === 'Passed') s.passed++;
            else if (tc.testStatus === 'Failed') s.failed++;
            else if (tc.testStatus === 'Blocked') s.blocked++;
        }
        return Array.from(map.entries())
            .map(([name, stats]) => ({ name, ...stats, passRate: stats.passed + stats.failed > 0 ? Math.round((stats.passed / (stats.passed + stats.failed)) * 100) : 0 }))
            .sort((a, b) => b.assigned - a.assigned);
    }, [testCases]);

    return (
        <div className="space-y-6">
            {/* Execution Summary */}
            <div className="bg-white rounded-2xl border border-[#E2E8F0] p-6">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-semibold text-[#1E293B]">Test Execution Summary</h3>
                    <Button variant="secondary" size="sm" onClick={onExport} leftIcon={<Download className="w-4 h-4" />}>Export Report</Button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <ReportStat label="Total Cases" value={safeNumber(analytics.totalCases)} color="#3B82F6" />
                    <ReportStat label="Pass Rate" value={`${safeNumber(analytics.passRate)}%`} color="#22C55E" />
                    <ReportStat label="Passed" value={safeNumber(analytics.passed)} color="#22C55E" />
                    <ReportStat label="Failed" value={safeNumber(analytics.failed)} color="#EF4444" />
                    <ReportStat label="Blocked" value={safeNumber(analytics.blocked)} color="#F97316" />
                </div>
            </div>

            {/* Module Report */}
            <div className="bg-white rounded-2xl border border-[#E2E8F0] overflow-hidden">
                <div className="px-5 py-4 border-b border-[#E2E8F0]">
                    <h3 className="text-base font-semibold text-[#1E293B]">Module Report</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                                <th className="text-left px-4 py-2 text-xs font-semibold text-[#64748B] uppercase">Module</th>
                                <th className="text-right px-4 py-2 text-xs font-semibold text-[#64748B] uppercase">Total</th>
                                <th className="text-right px-4 py-2 text-xs font-semibold text-[#64748B] uppercase">Passed</th>
                                <th className="text-right px-4 py-2 text-xs font-semibold text-[#64748B] uppercase">Failed</th>
                                <th className="text-right px-4 py-2 text-xs font-semibold text-[#64748B] uppercase">Not Executed</th>
                                <th className="text-right px-4 py-2 text-xs font-semibold text-[#64748B] uppercase">Pass Rate</th>
                            </tr>
                        </thead>
                        <tbody>
                            {analytics.moduleCoverage.length === 0 ? (
                                <tr><td colSpan={6} className="py-2"><EmptyState compact icon={Layers} title="No module coverage data" description="Module breakdown will appear once test cases exist." /></td></tr>
                            ) : analytics.moduleCoverage.map(mc => {
                                const rate = mc.passed + mc.failed > 0 ? Math.round((mc.passed / (mc.passed + mc.failed)) * 100) : 0;
                                return (
                                    <tr key={mc.module} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition-colors">
                                        <td className="px-4 py-2.5 text-sm font-medium text-[#1E293B]">{mc.module}</td>
                                        <td className="px-4 py-2.5 text-sm text-right text-[#64748B]">{mc.total}</td>
                                        <td className="px-4 py-2.5 text-sm text-right text-[#22C55E] font-medium">{mc.passed}</td>
                                        <td className="px-4 py-2.5 text-sm text-right text-[#EF4444] font-medium">{mc.failed}</td>
                                        <td className="px-4 py-2.5 text-sm text-right text-[#94A3B8]">{mc.notExecuted}</td>
                                        <td className="px-4 py-2.5 text-sm text-right">
                                            <span className={`font-semibold ${rate >= 80 ? 'text-[#22C55E]' : rate >= 50 ? 'text-[#F59E0B]' : 'text-[#EF4444]'}`}>{rate}%</span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Priority + Tester Reports */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Priority Report */}
                <div className="bg-white rounded-2xl border border-[#E2E8F0] overflow-hidden">
                    <div className="px-5 py-4 border-b border-[#E2E8F0]">
                        <h3 className="text-base font-semibold text-[#1E293B]">Priority Report</h3>
                    </div>
                    <div className="p-5 space-y-3">
                        {analytics.priorityDistribution.map(p => (
                            <div key={p.priority} className="flex items-center gap-3">
                                <div className="w-20 flex-shrink-0">
                                    <PriorityBadge priority={p.priority} />
                                </div>
                                <div className="flex-1 h-6 bg-[#F1F5F9] rounded-lg overflow-hidden">
                                    <div className="h-full rounded-lg flex items-center justify-end pr-2" style={{ width: `${analytics.totalCases > 0 ? (p.count / analytics.totalCases) * 100 : 0}%`, background: PRIORITY_COLORS[p.priority], minWidth: p.count > 0 ? '30px' : '0' }}>
                                        {p.count > 0 && <span className="text-xs font-bold text-white">{p.count}</span>}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Tester Report */}
                <div className="bg-white rounded-2xl border border-[#E2E8F0] overflow-hidden">
                    <div className="px-5 py-4 border-b border-[#E2E8F0]">
                        <h3 className="text-base font-semibold text-[#1E293B]">Tester Report</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                                    <th className="text-left px-3 py-2 text-xs font-semibold text-[#64748B] uppercase">Tester</th>
                                    <th className="text-right px-3 py-2 text-xs font-semibold text-[#64748B] uppercase">Assigned</th>
                                    <th className="text-right px-3 py-2 text-xs font-semibold text-[#64748B] uppercase">Passed</th>
                                    <th className="text-right px-3 py-2 text-xs font-semibold text-[#64748B] uppercase">Failed</th>
                                    <th className="text-right px-3 py-2 text-xs font-semibold text-[#64748B] uppercase">Rate</th>
                                </tr>
                            </thead>
                            <tbody>
                                {testerStats.length === 0 ? (
                                    <tr><td colSpan={5} className="py-2"><EmptyState compact icon={Users} title="No tester data" description="Tester assignments will appear here." /></td></tr>
                                ) : testerStats.map(t => (
                                    <tr key={t.name} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition-colors">
                                        <td className="px-3 py-2 text-sm text-[#1E293B]">{t.name}</td>
                                        <td className="px-3 py-2 text-sm text-right text-[#64748B]">{t.assigned}</td>
                                        <td className="px-3 py-2 text-sm text-right text-[#22C55E] font-medium">{t.passed}</td>
                                        <td className="px-3 py-2 text-sm text-right text-[#EF4444] font-medium">{t.failed}</td>
                                        <td className="px-3 py-2 text-sm text-right">
                                            <span className={`font-semibold ${t.passRate >= 80 ? 'text-[#22C55E]' : t.passRate >= 50 ? 'text-[#F59E0B]' : 'text-[#EF4444]'}`}>{t.passRate}%</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════ */
/* ═══ SHARED COMPONENTS ═════════════════════════════ */
/* ═══════════════════════════════════════════════════ */

function TabButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
    return (
        <button onClick={onClick}
            className={`flex items-center gap-2 px-4 h-9 rounded-lg text-sm font-medium transition-all ${active ? 'bg-white text-[#0F172A] shadow-sm' : 'text-[#64748B] hover:text-[#1E293B]'}`}>
            {icon}{children}
        </button>
    );
}

function KPICard({ icon, label, value, color, bgColor }: { icon: React.ReactNode; label: string; value: number | string; color: string; bgColor: string }) {
    return (
        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-3 hover:shadow-md transition-shadow">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-2" style={{ background: bgColor, color }}>
                {icon}
            </div>
            <p className="text-xl font-bold text-[#0F172A] tracking-tight">{typeof value === 'number' ? value.toLocaleString() : value}</p>
            <p className="text-[11px] text-[#64748B] mt-0.5">{label}</p>
        </div>
    );
}

function ReportStat({ label, value, color }: { label: string; value: number | string; color: string }) {
    return (
        <div className="rounded-xl p-4 text-center" style={{ background: `${color}10`, border: `1px solid ${color}20` }}>
            <p className="text-2xl font-bold" style={{ color }}>{typeof value === 'number' ? value.toLocaleString() : value}</p>
            <p className="text-xs text-[#64748B] mt-1">{label}</p>
        </div>
    );
}

function FilterDropdown({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
    const selectOptions: SelectOption[] = options.map(opt => ({ value: opt, label: opt }));
    return (
        <div className="flex items-center gap-2">
            <span className="text-xs text-[#94A3B8] font-medium whitespace-nowrap">{label}:</span>
            <div style={{ width: '150px' }}>
                <CustomSelect options={selectOptions} value={value} onChange={onChange} height={38} />
            </div>
        </div>
    );
}

function Dot({ color }: { color: string }) {
    return <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />;
}

function PriorityBadge({ priority }: { priority: TestCasePriority }) {
    const colors: Record<TestCasePriority, string> = {
        Critical: 'bg-[#FEF2F2] text-[#EF4444]',
        High: 'bg-[#FFF7ED] text-[#F97316]',
        Medium: 'bg-[#FEFCE8] text-[#F59E0B]',
        Low: 'bg-[#F0FDF4] text-[#22C55E]',
    };
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${colors[priority]}`}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'currentColor' }} />
            {priority}
        </span>
    );
}

