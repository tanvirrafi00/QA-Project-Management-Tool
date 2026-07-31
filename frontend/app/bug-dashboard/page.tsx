'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import {
    AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { AppShell, PageContainer } from '@/components/layout';
import { Button } from '@/components/core';
import { CustomSelect, type SelectOption } from '@/components/ui/CustomSelect';
import { Pagination, usePagination } from '@/components/ui/Pagination';
import { ChartCard } from '@/components/ui/ChartCard';
import { EmptyBugs, EmptySearch, EmptyState } from '@/components/states';
import { formatStat } from '@/lib/safe-value';
import {
    Bug, AlertCircle, Clock, RefreshCw, TrendingUp,
    Download, Sparkles, Activity,
    AlertTriangle, Shield, Monitor, Server, Layers,
    Search, Loader2, Eye, Upload, Plus,
    ArrowUp, ArrowDown, ArrowUpDown,
} from 'lucide-react';
import { AddBugDialog } from '@/features/bug-management/components/AddBugDialog';
import { PasteBugsDialog } from '@/features/bug-management/components/PasteBugsDialog';
import { useRouter } from 'next/navigation';
import {
    fetchBugDashboardData, BugDashboardData, BugLayer, BugItem, BugStatus, BugSeverity, BugPriority,
} from '@/services/bug-dashboard.service';
import { useModuleProject } from '@/features/project-management/hooks/useModuleProject';
import { ModuleProjectSelector } from '@/features/project-management/components/ModuleProjectSelector';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/features/auth/AuthContext';
import { bugService } from '@/features/bug-management/services/bug.service';
import { projectService } from '@/features/project-management/services/project.service';
import type { UpdateBugInput } from '@/features/bug-management/types';
import type { ProjectMember } from '@/features/project-management/types';
import { quickAddBug, type QuickAddBugInput } from '@/features/bug-management/services/bug-quick-add.service';
import { InlineSelectCell } from '@/components/inline/InlineSelectCell';
import { InlineAssigneeCell } from '@/components/inline/InlineAssigneeCell';
import {
    SEVERITIES, PRIORITIES, SEVERITY_COLOR, STATUS_COLOR, PRIORITY_COLOR, nextStatuses,
} from '@/features/bug-management/components/bug-field-options';
import * as XLSX from 'xlsx';

type TabId = 'dashboard' | 'bugList';
type LayerFilter = 'All' | BugLayer;

export default function BugDashboardPage() {
    // This module owns its own project selection (per-module, persisted) — see useModuleProject.
    // The page never fabricates a project name and never fetches when none is selected.
    const { projects, selectedProjectName, setSelectedProject, loading: projectsLoading } = useModuleProject('bug-dashboard');
    const router = useRouter();
    const project = selectedProjectName;
    const { user } = useAuth();
    const toast = useToast();
    // Role drives inline-edit permissions (UI defense-in-depth; the backend is authoritative).
    // Unknown/no-session ⇒ admin (open in dev; the proxy + backend enforce in prod).
    const role = user?.role ?? 'admin';

    const [data, setData] = useState<BugDashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [members, setMembers] = useState<ProjectMember[]>([]);
    const [showAddBugDialog, setShowAddBugDialog] = useState(false);
    const [addBugSaving, setAddBugSaving] = useState(false);
    // Key (`${bugId}:${field}`) of the inline cell currently saving — drives its spinner + revert.
    const [saving, setSaving] = useState<string | null>(null);
    // Persist the active tab + list scroll so returning from Bug Details lands where you left off.
    const [activeTab, setActiveTab] = useState<TabId>(() => {
        if (typeof window === 'undefined') return 'dashboard';
        return (sessionStorage.getItem('bug.activeTab') as TabId) || 'dashboard';
    });

    const loadData = useCallback(async () => {
        // No project selected → clear data and do not call the API.
        if (!project) {
            setData(null);
            setMembers([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        const [dashboardData, membersRes] = await Promise.all([
            fetchBugDashboardData(project),
            projectService.getProjectMembers(project),
        ]);
        setData(dashboardData);
        setMembers(membersRes.data ?? []);
        setLoading(false);
    }, [project]);

    /**
     * Silent refresh — re-fetch the dashboard data + members WITHOUT toggling the full-page loading
     * spinner, so inline edits update the KPIs/charts and the Assignee list without disrupting the view.
     * The server is the single source of truth (reporting-rules.md): we re-read, never recompute.
     */
    const refreshData = useCallback(async () => {
        if (!project) return;
        const [dashboardData, membersRes] = await Promise.all([
            fetchBugDashboardData(project),
            projectService.getProjectMembers(project),
        ]);
        setData(dashboardData);
        setMembers(membersRes.data ?? []);
    }, [project]);

    /**
     * Inline update flow: optimistic local patch → PATCH → silent refresh on success / revert on error.
     * (version-based concurrency isn't wired on this endpoint, so we rely on optimistic + refetch.)
     */
    const handleInlineUpdate = useCallback(async (
        bugId: string,
        field: 'status' | 'severity' | 'priority' | 'assignee',
        value: string,
    ) => {
        const key = `${bugId}:${field}`;
        const memberName = field === 'assignee' ? (members.find(m => m.id === value)?.name ?? '') : '';

        // 1. Optimistic local patch for immediate feedback.
        setData(d => d ? {
            ...d,
            allBugs: d.allBugs.map(b => {
                if (b.id !== bugId) return b;
                if (field === 'status') return { ...b, status: value as BugStatus };
                if (field === 'severity') return { ...b, severity: value as BugSeverity };
                if (field === 'priority') return { ...b, priority: value as BugPriority };
                return { ...b, assigneeId: value, assignee: memberName || 'Unassigned' };
            }),
        } : d);

        // 2. Persist (single-field PATCH; change tracking + history happen server-side).
        setSaving(key);
        const updates: UpdateBugInput = { changedBy: user?.name ?? 'QA Team' };
        if (field === 'status') updates.status = value as BugStatus;
        else if (field === 'severity') updates.severity = value as BugSeverity;
        else if (field === 'priority') updates.priority = value as BugPriority;
        else updates.assignee = value;

        const result = await bugService.updateBug(bugId, updates);
        setSaving(null);

        // 3. Success → silent refresh (syncs KPIs/charts). Error → refresh reverts to server truth.
        if (result.success) {
            toast.success('Bug updated successfully.');
            refreshData();
        } else {
            toast.error(result.error || 'Unable to update bug. Please try again.');
            refreshData();
        }
    }, [members, user, refreshData, toast]);

    /**
     * Handle adding a bug
     */
    const handleAddBug = useCallback(async (input: QuickAddBugInput) => {
        setAddBugSaving(true);
        const result = await quickAddBug(input);
        setAddBugSaving(false);

        if (result.success) {
            toast.success('Bug added successfully');
            refreshData();
        } else {
            toast.error(result.error || 'Failed to add bug');
        }
    }, [refreshData, toast]);

    /**
     * Refresh data after adding a bug (called by dialog)
     */
    const handleBugSaved = useCallback(async () => {
        await refreshData();
    }, [refreshData]);

    const handleViewBug = useCallback((bugId: string) => {
        router.push(`/bugs/${bugId}`);
    }, [router]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Persist the active tab; save/restore the list scroll position across the Bug Details detour.
    useEffect(() => {
        sessionStorage.setItem('bug.activeTab', activeTab);
    }, [activeTab]);

    useEffect(() => {
        const scroller = document.querySelector('main');
        if (!scroller) return;
        const onScroll = () => sessionStorage.setItem('bug.listScroll', String(scroller.scrollTop));
        scroller.addEventListener('scroll', onScroll, { passive: true });
        return () => scroller.removeEventListener('scroll', onScroll);
    }, []);

    useEffect(() => {
        if (!data) return;
        const scroller = document.querySelector('main');
        if (!scroller) return;
        const saved = Number(sessionStorage.getItem('bug.listScroll') || 0);
        if (saved > 0) scroller.scrollTop = saved;
    }, [data]);

    const handleExportExcel = (layerFilter?: LayerFilter) => {
        if (!data) return;
        const bugs = layerFilter === 'All' || !layerFilter
            ? data.allBugs
            : data.allBugs.filter(b => b.layer === layerFilter);

        const wb = XLSX.utils.book_new();
        const sheetData = [
            ['Bug ID', 'Title', 'Module', 'Layer', 'Severity', 'Priority', 'Status', 'Reporter', 'Assignee', 'Age (Days)', 'Created Date'],
            ...bugs.map(b => [b.id, b.title, b.module, b.layer, b.severity, b.priority, b.status, b.reporter, b.assignee, b.age, b.createdDate]),
        ];
        const suffix = layerFilter && layerFilter !== 'All' ? `_${layerFilter}` : '_All';
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheetData), 'Bugs');
        XLSX.writeFile(wb, `${(project ?? 'Bugs').replace(/\s/g, '_')}${suffix}_Bugs.xlsx`);
    };

    return (
        <AppShell>
            <PageContainer>
                <div className="space-y-6">
                    {/* Header */}
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div>
                            <h1 className="text-2xl font-bold text-[#0F172A] tracking-tight">Bug Management Dashboard</h1>
                            <p className="text-sm text-[#64748B] mt-1">Frontend vs Backend quality analytics</p>
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
                            <Button variant="primary" size="sm" onClick={() => router.push('/bug-import')} leftIcon={<Upload className="w-4 h-4" />}>
                                Import Bugs
                            </Button>
                        </div>
                    </div>

                    {/* No Project Selected */}
                    {!project ? (
                        <div className="flex flex-col items-center justify-center py-20">
                            <div className="w-14 h-14 rounded-2xl bg-[#F1F5F9] flex items-center justify-center mb-4">
                                <Bug className="w-7 h-7 text-[#94A3B8]" />
                            </div>
                            <p className="text-base font-semibold text-[#1E293B] mb-1">No project selected</p>
                            <p className="text-sm text-[#64748B]">Choose a project from the dropdown above to view its bug analytics.</p>
                        </div>
                    ) : loading || !data ? (
                        <div className="flex flex-col items-center justify-center py-20">
                            <Loader2 className="w-8 h-8 text-[#06B6D4] animate-spin mb-3" />
                            <p className="text-sm text-[#64748B]">Loading bug analytics...</p>
                        </div>
                    ) : (
                        <>
                            {/* Tabs */}
                            <div className="flex items-center gap-1 bg-[#F1F5F9] rounded-xl p-1 w-fit">
                                <TabButton active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<Activity className="w-4 h-4" />}>
                                    Dashboard
                                </TabButton>
                                <TabButton active={activeTab === 'bugList'} onClick={() => setActiveTab('bugList')} icon={<Bug className="w-4 h-4" />}>
                                    Bug List
                                </TabButton>
                            </div>

                            {activeTab === 'dashboard' ? (
                                <DashboardView data={data} onExport={handleExportExcel} onViewBug={handleViewBug} />
                            ) : (
                                <BugListView
                                    data={data}
                                    onExport={handleExportExcel}
                                    onViewBug={handleViewBug}
                                    loadingBug={false}
                                    onInlineUpdate={handleInlineUpdate}
                                    onAddBug={handleAddBug}
                                    addBugSaving={addBugSaving}
                                    members={members}
                                    role={role}
                                    currentUserId={user?.id}
                                    savingKey={saving}
                                    project={project}
                                    onBugAdded={handleBugSaved}
                                />
                            )}
                        </>
                    )}
                </div>
            </PageContainer>
        </AppShell>
    );
}

/* ═══════════════════════════════════════════════════ */
/* ═══ DASHBOARD VIEW ═════════════════════════════════ */
/* ═══════════════════════════════════════════════════ */

function DashboardView({ data, onExport, onViewBug }: { data: BugDashboardData; onExport: (layer?: LayerFilter) => void; onViewBug: (bugId: string) => void }) {
    return (
        <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <KPICard icon={<Bug />} label="Total Bugs" value={formatStat(data.kpis.totalBugs)} color="#3B82F6" bgColor="#EFF6FF" />
                <KPICard icon={<Monitor />} label="Frontend" value={formatStat(data.kpis.frontendBugs)} color="#3B82F6" bgColor="#EFF6FF" />
                <KPICard icon={<Server />} label="Backend" value={formatStat(data.kpis.backendBugs)} color="#8B5CF6" bgColor="#F5F3FF" />
                <KPICard icon={<Layers />} label="Integration" value={formatStat(data.kpis.integrationBugs)} color="#06B6D4" bgColor="#ECFEFF" />
                <KPICard icon={<AlertCircle />} label="Open Bugs" value={formatStat(data.kpis.openBugs)} color="#EF4444" bgColor="#FEF2F2" />
                <KPICard icon={<AlertTriangle />} label="Critical" value={formatStat(data.kpis.criticalBugs)} color="#DC2626" bgColor="#FEF2F2" />
            </div>

            {/* Layer Comparison + Bug Trend */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <ChartCard title="Bugs by Layer" icon={<Layers className="w-5 h-5" />} data={data.layerComparison} height={280}>
                    <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={data.layerComparison}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                            <XAxis dataKey="layer" tick={{ fontSize: 11, fill: '#64748B' }} />
                            <YAxis tick={{ fontSize: 12, fill: '#64748B' }} />
                            <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 13 }} />
                            <Bar dataKey="bugs" radius={[8, 8, 0, 0]}>
                                {data.layerComparison.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </ChartCard>

                <div className="lg:col-span-2">
                    <ChartCard title="Bug Trend by Layer" icon={<TrendingUp className="w-5 h-5" />} data={data.bugTrend} height={280}>
                        <ResponsiveContainer width="100%" height={280}>
                            <AreaChart data={data.bugTrend}>
                                <defs>
                                    <linearGradient id="feGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} /><stop offset="95%" stopColor="#3B82F6" stopOpacity={0} /></linearGradient>
                                    <linearGradient id="beGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3} /><stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} /></linearGradient>
                                    <linearGradient id="intGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#06B6D4" stopOpacity={0.3} /><stop offset="95%" stopColor="#06B6D4" stopOpacity={0} /></linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748B' }} />
                                <YAxis tick={{ fontSize: 12, fill: '#64748B' }} />
                                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 13 }} />
                                <Legend wrapperStyle={{ fontSize: 12 }} />
                                <Area type="monotone" dataKey="frontend" stroke="#3B82F6" strokeWidth={2} fill="url(#feGrad)" />
                                <Area type="monotone" dataKey="backend" stroke="#8B5CF6" strokeWidth={2} fill="url(#beGrad)" />
                                <Area type="monotone" dataKey="integration" stroke="#06B6D4" strokeWidth={2} fill="url(#intGrad)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </ChartCard>
                </div>
            </div>

            {/* Frontend vs Backend Severity */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ChartCard title="Frontend Severity" icon={<Monitor className="w-5 h-5 text-[#3B82F6]" />} data={data.frontendSeverity} height={250}>
                    <ResponsiveContainer width="100%" height={250}>
                        <PieChart>
                            <Pie data={data.frontendSeverity} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={45} label={({ name, value }) => `${name}: ${value}`}>
                                {data.frontendSeverity.map((e, i) => <Cell key={i} fill={e.color} />)}
                            </Pie>
                            <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 13 }} />
                        </PieChart>
                    </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Backend Severity" icon={<Server className="w-5 h-5 text-[#8B5CF6]" />} data={data.backendSeverity} height={250}>
                    <ResponsiveContainer width="100%" height={250}>
                        <PieChart>
                            <Pie data={data.backendSeverity} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={45} label={({ name, value }) => `${name}: ${value}`}>
                                {data.backendSeverity.map((e, i) => <Cell key={i} fill={e.color} />)}
                            </Pie>
                            <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 13 }} />
                        </PieChart>
                    </ResponsiveContainer>
                </ChartCard>
            </div>

            {/* Frontend vs Backend Modules */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ChartCard title="Frontend Module Bugs" icon={<Monitor className="w-5 h-5 text-[#3B82F6]" />} data={data.frontendModules} height={250}>
                    <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={data.frontendModules} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
                            <XAxis type="number" tick={{ fontSize: 12, fill: '#64748B' }} />
                            <YAxis type="category" dataKey="module" tick={{ fontSize: 10, fill: '#64748B' }} width={110} />
                            <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 13 }} />
                            <Bar dataKey="bugs" radius={[0, 8, 8, 0]} fill="#3B82F6" />
                        </BarChart>
                    </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Backend Module Bugs" icon={<Server className="w-5 h-5 text-[#8B5CF6]" />} data={data.backendModules} height={250}>
                    <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={data.backendModules} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
                            <XAxis type="number" tick={{ fontSize: 12, fill: '#64748B' }} />
                            <YAxis type="category" dataKey="module" tick={{ fontSize: 10, fill: '#64748B' }} width={110} />
                            <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 13 }} />
                            <Bar dataKey="bugs" radius={[0, 8, 8, 0]} fill="#8B5CF6" />
                        </BarChart>
                    </ResponsiveContainer>
                </ChartCard>
            </div>

            {/* Resolution Time + Status Distribution */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ChartCard title="Avg Resolution Time by Layer" icon={<Clock className="w-5 h-5" />} data={data.resolutionByLayer} height={250}>
                    <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={data.resolutionByLayer}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                            <XAxis dataKey="layer" tick={{ fontSize: 11, fill: '#64748B' }} />
                            <YAxis tick={{ fontSize: 12, fill: '#64748B' }} unit="d" />
                            <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 13 }} />
                            <Bar dataKey="days" radius={[8, 8, 0, 0]}>
                                {data.resolutionByLayer.map((e, i) => <Cell key={i} fill={e.color} />)}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Status Distribution" icon={<Activity className="w-5 h-5" />} data={data.statusDistribution} height={250}>
                    <ResponsiveContainer width="100%" height={250}>
                        <PieChart>
                            <Pie data={data.statusDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={50}>
                                {data.statusDistribution.map((e, i) => <Cell key={i} fill={e.color} />)}
                            </Pie>
                            <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 13 }} />
                            <Legend wrapperStyle={{ fontSize: 11 }} />
                        </PieChart>
                    </ResponsiveContainer>
                </ChartCard>
            </div>

            {/* Critical Bug Monitors */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <CriticalBugTable title="Critical Frontend Bugs" icon={<Monitor className="w-5 h-5 text-[#3B82F6]" />} bugs={data.criticalFrontendBugs} accentColor="#3B82F6" onViewBug={onViewBug} />
                <CriticalBugTable title="Critical Backend Bugs" icon={<Server className="w-5 h-5 text-[#8B5CF6]" />} bugs={data.criticalBackendBugs} accentColor="#8B5CF6" onViewBug={onViewBug} />
            </div>

            {/* Team Analytics */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <TeamAnalytics title="Frontend Team" icon={<Monitor className="w-5 h-5 text-[#3B82F6]" />} team={data.frontendTeam} accentColor="#3B82F6" />
                <TeamAnalytics title="Backend Team" icon={<Server className="w-5 h-5 text-[#8B5CF6]" />} team={data.backendTeam} accentColor="#8B5CF6" />
            </div>

            {/* AI Insights */}
            <div className="bg-gradient-to-br from-[#0F172A] to-[#1E293B] rounded-2xl p-6 text-white">
                <div className="flex items-center gap-2 mb-5">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#06B6D4] to-[#3B82F6] flex items-center justify-center">
                        <Sparkles className="w-4 h-4 text-white" />
                    </div>
                    <h3 className="text-base font-semibold">AI Quality Insights</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-[#3B82F6]/10 rounded-xl p-4 border border-[#3B82F6]/20">
                        <div className="flex items-center gap-2 mb-2">
                            <Monitor className="w-4 h-4 text-[#60A5FA]" />
                            <span className="text-xs font-semibold text-[#94A3B8] uppercase">Frontend Insight</span>
                        </div>
                        <p className="text-sm font-semibold mb-1">{data.aiInsights.frontend.problematicArea}</p>
                        <p className="text-xs text-[#94A3B8] leading-relaxed">{data.aiInsights.frontend.reason}</p>
                    </div>
                    <div className="bg-[#8B5CF6]/10 rounded-xl p-4 border border-[#8B5CF6]/20">
                        <div className="flex items-center gap-2 mb-2">
                            <Server className="w-4 h-4 text-[#A78BFA]" />
                            <span className="text-xs font-semibold text-[#94A3B8] uppercase">Backend Insight</span>
                        </div>
                        <p className="text-sm font-semibold mb-1">{data.aiInsights.backend.problematicArea}</p>
                        <p className="text-xs text-[#94A3B8] leading-relaxed">{data.aiInsights.backend.reason}</p>
                    </div>
                    <div className="bg-white/5 rounded-xl p-4 border border-white/10 md:col-span-2">
                        <div className="flex items-center gap-2 mb-2">
                            <Shield className="w-4 h-4 text-[#EF4444]" />
                            <span className="text-xs font-semibold text-[#94A3B8] uppercase">Highest Risk Area</span>
                        </div>
                        <p className="text-sm font-semibold mb-3">{data.aiInsights.highestRiskArea}</p>
                        <div className="flex items-center gap-2 mb-2">
                            <RefreshCw className="w-4 h-4 text-[#06B6D4]" />
                            <span className="text-xs font-semibold text-[#94A3B8] uppercase">Suggested Regression Areas</span>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-2">
                            {data.aiInsights.regressionAreas.map(a => (
                                <span key={a} className="px-3 py-1.5 rounded-lg bg-[#06B6D4]/20 text-[#06B6D4] text-sm font-medium border border-[#06B6D4]/30">{a}</span>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Export Buttons */}
            <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm text-[#64748B] font-medium">Export Reports:</span>
                <Button variant="secondary" size="sm" onClick={() => onExport('Frontend')} leftIcon={<Download className="w-4 h-4" />}>Frontend Bugs</Button>
                <Button variant="secondary" size="sm" onClick={() => onExport('Backend')} leftIcon={<Download className="w-4 h-4" />}>Backend Bugs</Button>
                <Button variant="secondary" size="sm" onClick={() => onExport('All')} leftIcon={<Download className="w-4 h-4" />}>Full Project Report</Button>
            </div>
        </>
    );
}

/* ═══════════════════════════════════════════════════ */
/* ═══ BUG LIST VIEW ══════════════════════════════════ */
/* ═══════════════════════════════════════════════════ */

function BugListView({
    data, onExport, onViewBug, loadingBug, onInlineUpdate, onAddBug, addBugSaving, members, role, currentUserId, savingKey, project, onBugAdded,
}: {
    data: BugDashboardData;
    onExport: (layer?: LayerFilter) => void;
    onViewBug: (bugId: string) => void;
    loadingBug: boolean;
    onInlineUpdate: (bugId: string, field: 'status' | 'severity' | 'priority' | 'assignee', value: string) => void;
    onAddBug?: (input: QuickAddBugInput) => Promise<void>;
    addBugSaving?: boolean;
    members: ProjectMember[];
    role: 'admin' | 'qa_lead' | 'qa_engineer';
    currentUserId?: string;
    savingKey: string | null;
    project?: string;
    onBugAdded?: () => void;
}) {
    const [showAddBugDialog, setShowAddBugDialog] = useState(false);

    // Default sort: Bug ID ascending (so the list always opens in a predictable order).
    const [sortKey, setSortKey] = useState<string>('id');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

    /** Toggle sort: click a column → sort asc; click again → desc. */
    const handleSort = (key: string) => {
        if (sortKey === key) {
            setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortKey(key);
            setSortDir('asc');
        }
    };

    /**
     * Natural/numeric-aware comparator. Extracts the TRAILING numeric portion of an ID so that
     * "BUG-P2-BE-MRC-065" → 65, "BUG-002" → 2. Falls back to localeCompare when no trailing
     * number is present (or when the numbers are equal).
     */
    const compareValues = (a: string, b: string): number => {
        const aStr = String(a ?? '');
        const bStr = String(b ?? '');
        // Extract only the trailing digits (the sequence number at the end of the ID).
        const aMatch = aStr.match(/(\d+)$/);
        const bMatch = bStr.match(/(\d+)$/);
        if (aMatch && bMatch) {
            const aNum = parseInt(aMatch[1], 10);
            const bNum = parseInt(bMatch[1], 10);
            if (aNum !== bNum) return aNum - bNum;
        }
        return aStr.localeCompare(bStr, undefined, { numeric: true, sensitivity: 'base' });
    };

    /** Extract the raw sort value for a given column key from a bug row. */
    const getSortValue = (bug: BugItem, key: string): string => {
        switch (key) {
            case 'id': return bug.id;
            case 'title': return bug.title;
            case 'module': return bug.module;
            case 'layer': return bug.layer;
            case 'severity': return bug.severity;
            case 'priority': return bug.priority;
            case 'status': return bug.status;
            case 'assignee': return bug.assignee;
            case 'age': return String(bug.age);
            default: return '';
        }
    };

    const handleBugSaved = useCallback(async () => {
        setShowAddBugDialog(false);
        if (onBugAdded) {
            await onBugAdded();
        }
    }, [onBugAdded]);
    // Restore the list state (filters + pagination) saved before navigating to Bug Details, so the
    // user lands back where they left off. SSR-safe (sessionStorage is unavailable on the server).
    const restored = typeof window === 'undefined'
        ? ({} as Record<string, unknown>)
        : (() => { try { return JSON.parse(sessionStorage.getItem('bug.listState') || '{}') as Record<string, unknown>; } catch { return {} as Record<string, unknown>; } })();
    const [layerFilter, setLayerFilter] = useState<LayerFilter>((restored.layerFilter as LayerFilter) ?? 'All');
    const [statusFilter, setStatusFilter] = useState<string>((restored.statusFilter as string) ?? 'All');
    const [severityFilter, setSeverityFilter] = useState<string>((restored.severityFilter as string) ?? 'All');
    const [search, setSearch] = useState((restored.search as string) ?? '');

    const filteredBugs = useMemo(() => {
        const filtered = data.allBugs.filter(bug => {
            if (layerFilter !== 'All' && bug.layer !== layerFilter) return false;
            if (statusFilter !== 'All' && bug.status !== statusFilter) return false;
            if (severityFilter !== 'All' && bug.severity !== severityFilter) return false;
            if (search && !bug.title.toLowerCase().includes(search.toLowerCase()) && !bug.id.toLowerCase().includes(search.toLowerCase())) return false;
            return true;
        });
        // Sort the filtered list by the active sort key/direction.
        return filtered.sort((a, b) => {
            const cmp = compareValues(getSortValue(a, sortKey), getSortValue(b, sortKey));
            return sortDir === 'asc' ? cmp : -cmp;
        });
    }, [data.allBugs, layerFilter, statusFilter, severityFilter, search, sortKey, sortDir]);

    // Whether any layer/status/severity/search filter is active — drives empty-state copy.
    const hasActiveFilters = layerFilter !== 'All' || statusFilter !== 'All' || severityFilter !== 'All' || !!search;
    const clearFilters = () => { setLayerFilter('All'); setStatusFilter('All'); setSeverityFilter('All'); setSearch(''); };

    // Pagination over the filtered list; resets to page 1 when filters change.
    const filterKey = `${layerFilter}|${statusFilter}|${severityFilter}|${search}`;
    const {
        page, pageSize, setPage, setPageSize,
        totalPages, totalItems, startIdx, endIdx,
        paginatedItems: paginatedBugs,
    } = usePagination(filteredBugs, (restored.pageSize as number) ?? 25, filterKey, (restored.page as number) ?? 1);

    // Persist the list state so it survives the Bug Details detour (filters + page + page size).
    useEffect(() => {
        sessionStorage.setItem('bug.listState', JSON.stringify({ layerFilter, statusFilter, severityFilter, search, page, pageSize }));
    }, [layerFilter, statusFilter, severityFilter, search, page, pageSize]);

    const layerTabs: { label: string; value: LayerFilter; count: number; color: string }[] = [
        { label: 'All Bugs', value: 'All', count: data.allBugs.length, color: '#3B82F6' },
        { label: 'Frontend', value: 'Frontend', count: data.kpis.frontendBugs, color: '#3B82F6' },
        { label: 'Backend', value: 'Backend', count: data.kpis.backendBugs, color: '#8B5CF6' },
        { label: 'Integration', value: 'Integration', count: data.kpis.integrationBugs, color: '#06B6D4' },
        { label: 'Mobile', value: 'Mobile', count: data.kpis.mobileBugs, color: '#F97316' },
    ];

    return (
        <>
            {/* Quick Switch Tabs */}
            <div className="flex items-center gap-2 flex-wrap">
                {layerTabs.map(tab => (
                    <button
                        key={tab.value}
                        onClick={() => setLayerFilter(tab.value)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${layerFilter === tab.value
                            ? 'text-white shadow-sm'
                            : 'bg-white text-[#64748B] border border-[#E2E8F0] hover:bg-[#F8FAFC]'
                            }`}
                        style={layerFilter === tab.value ? { background: tab.color } : {}}
                    >
                        {tab.label}
                        <span className={`px-1.5 py-0.5 rounded-md text-xs ${layerFilter === tab.value ? 'bg-white/20' : 'bg-[#F1F5F9]'}`}>
                            {tab.count}
                        </span>
                    </button>
                ))}
            </div>

            {/* Filters Bar */}
            <div className="bg-white rounded-2xl border border-[#E2E8F0] p-4 flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search by Bug ID or title..."
                        className="w-full pl-9 pr-4 h-10 rounded-xl border border-[#E2E8F0] text-sm text-[#1E293B] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#06B6D4]/20 focus:border-[#06B6D4]"
                    />
                </div>
                <FilterDropdown label="Status" value={statusFilter} options={['All', 'Open', 'Assigned', 'In Progress', 'Fixed', 'Ready For QA', 'Verified', 'Closed', 'Reopened']} onChange={setStatusFilter} />
                <FilterDropdown label="Severity" value={severityFilter} options={['All', 'Critical', 'High', 'Medium', 'Low']} onChange={setSeverityFilter} />
                <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setShowAddBugDialog(true)}
                    leftIcon={<Plus className="w-4 h-4" />}
                    isLoading={addBugSaving}
                    disabled={addBugSaving}
                >
                    Paste Bugs
                </Button>
                <Button variant="secondary" size="sm" onClick={() => onExport(layerFilter)} leftIcon={<Download className="w-4 h-4" />}>
                    Export
                </Button>
            </div>

            {/* Result Count */}
            <div className="flex items-center justify-between">
                <p className="text-sm text-[#64748B]">
                    Showing <span className="font-semibold text-[#1E293B]">{filteredBugs.length}</span> bugs
                    {layerFilter !== 'All' && <span className="text-[#06B6D4]"> in {layerFilter}</span>}
                </p>
            </div>

            {/* Bug Table */}
            <div className="bg-white rounded-2xl border border-[#E2E8F0] overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                                <th onClick={() => handleSort('id')} className="text-left px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wider cursor-pointer hover:text-[#0F172A] hover:bg-[#F1F5F9] transition-colors select-none whitespace-nowrap">
                                    <span className="inline-flex items-center gap-1">Bug ID {sortKey === 'id' ? (sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-[#06B6D4]" /> : <ArrowDown className="w-3 h-3 text-[#06B6D4]" />) : <ArrowUpDown className="w-3 h-3 text-[#CBD5E1]" />}</span>
                                </th>
                                <th onClick={() => handleSort('title')} className="text-left px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wider cursor-pointer hover:text-[#0F172A] hover:bg-[#F1F5F9] transition-colors select-none whitespace-nowrap">
                                    <span className="inline-flex items-center gap-1">Title {sortKey === 'title' ? (sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-[#06B6D4]" /> : <ArrowDown className="w-3 h-3 text-[#06B6D4]" />) : <ArrowUpDown className="w-3 h-3 text-[#CBD5E1]" />}</span>
                                </th>
                                <th onClick={() => handleSort('module')} className="text-left px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wider cursor-pointer hover:text-[#0F172A] hover:bg-[#F1F5F9] transition-colors select-none whitespace-nowrap">
                                    <span className="inline-flex items-center gap-1">Module {sortKey === 'module' ? (sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-[#06B6D4]" /> : <ArrowDown className="w-3 h-3 text-[#06B6D4]" />) : <ArrowUpDown className="w-3 h-3 text-[#CBD5E1]" />}</span>
                                </th>
                                <th onClick={() => handleSort('layer')} className="text-left px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wider cursor-pointer hover:text-[#0F172A] hover:bg-[#F1F5F9] transition-colors select-none whitespace-nowrap">
                                    <span className="inline-flex items-center gap-1">Layer {sortKey === 'layer' ? (sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-[#06B6D4]" /> : <ArrowDown className="w-3 h-3 text-[#06B6D4]" />) : <ArrowUpDown className="w-3 h-3 text-[#CBD5E1]" />}</span>
                                </th>
                                <th onClick={() => handleSort('severity')} className="text-left px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wider cursor-pointer hover:text-[#0F172A] hover:bg-[#F1F5F9] transition-colors select-none whitespace-nowrap">
                                    <span className="inline-flex items-center gap-1">Severity {sortKey === 'severity' ? (sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-[#06B6D4]" /> : <ArrowDown className="w-3 h-3 text-[#06B6D4]" />) : <ArrowUpDown className="w-3 h-3 text-[#CBD5E1]" />}</span>
                                </th>
                                <th onClick={() => handleSort('priority')} className="text-left px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wider cursor-pointer hover:text-[#0F172A] hover:bg-[#F1F5F9] transition-colors select-none whitespace-nowrap">
                                    <span className="inline-flex items-center gap-1">Priority {sortKey === 'priority' ? (sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-[#06B6D4]" /> : <ArrowDown className="w-3 h-3 text-[#06B6D4]" />) : <ArrowUpDown className="w-3 h-3 text-[#CBD5E1]" />}</span>
                                </th>
                                <th onClick={() => handleSort('status')} className="text-left px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wider cursor-pointer hover:text-[#0F172A] hover:bg-[#F1F5F9] transition-colors select-none whitespace-nowrap">
                                    <span className="inline-flex items-center gap-1">Status {sortKey === 'status' ? (sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-[#06B6D4]" /> : <ArrowDown className="w-3 h-3 text-[#06B6D4]" />) : <ArrowUpDown className="w-3 h-3 text-[#CBD5E1]" />}</span>
                                </th>
                                <th onClick={() => handleSort('assignee')} className="text-left px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wider cursor-pointer hover:text-[#0F172A] hover:bg-[#F1F5F9] transition-colors select-none whitespace-nowrap">
                                    <span className="inline-flex items-center gap-1">Assignee {sortKey === 'assignee' ? (sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-[#06B6D4]" /> : <ArrowDown className="w-3 h-3 text-[#06B6D4]" />) : <ArrowUpDown className="w-3 h-3 text-[#CBD5E1]" />}</span>
                                </th>
                                <th onClick={() => handleSort('age')} className="text-right px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wider cursor-pointer hover:text-[#0F172A] hover:bg-[#F1F5F9] transition-colors select-none whitespace-nowrap">
                                    <span className="inline-flex items-center gap-1">Age {sortKey === 'age' ? (sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-[#06B6D4]" /> : <ArrowDown className="w-3 h-3 text-[#06B6D4]" />) : <ArrowUpDown className="w-3 h-3 text-[#CBD5E1]" />}</span>
                                </th>
                                <th className="text-center px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wider whitespace-nowrap">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredBugs.length === 0 ? (
                                <tr>
                                    <td colSpan={10} className="py-2">
                                        {hasActiveFilters ? <EmptySearch onClear={clearFilters} /> : <EmptyBugs />}
                                    </td>
                                </tr>
                            ) : paginatedBugs.map(bug => {
                                const canEditClassified = role === 'admin' || role === 'qa_lead';
                                const canEditStatus = canEditClassified || (role === 'qa_engineer' && !!bug.assigneeId && bug.assigneeId === currentUserId);
                                const isSaving = (field: string) => savingKey === `${bug.id}:${field}`;
                                return (
                                    <tr key={bug.id} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition-colors cursor-pointer" onClick={() => onViewBug(bug.id)}>
                                        <td className="px-4 py-2.5 text-sm font-mono font-medium text-[#06B6D4] whitespace-nowrap">{bug.id}</td>
                                        <td className="px-4 py-2.5 text-sm text-[#1E293B] max-w-xs truncate">{bug.title}</td>
                                        <td className="px-4 py-2.5 text-sm text-[#64748B] whitespace-nowrap">{bug.module}</td>
                                        <td className="px-4 py-2.5"><LayerBadge layer={bug.layer} /></td>
                                        <td className="px-4 py-2.5">
                                            {canEditClassified ? (
                                                <InlineSelectCell
                                                    value={bug.severity}
                                                    options={SEVERITIES.map(s => ({ value: s, label: s, icon: <Dot color={SEVERITY_COLOR[s]} /> }))}
                                                    accentColor={SEVERITY_COLOR[bug.severity]}
                                                    loading={isSaving('severity')}
                                                    onChange={(v) => onInlineUpdate(bug.id, 'severity', v)}
                                                />
                                            ) : <SeverityBadge severity={bug.severity} />}
                                        </td>
                                        <td className="px-4 py-2.5">
                                            {canEditClassified ? (
                                                <InlineSelectCell
                                                    value={bug.priority}
                                                    options={PRIORITIES.map(p => ({ value: p, label: p, icon: <Dot color={PRIORITY_COLOR[p]} /> }))}
                                                    accentColor={PRIORITY_COLOR[bug.priority]}
                                                    loading={isSaving('priority')}
                                                    onChange={(v) => onInlineUpdate(bug.id, 'priority', v)}
                                                />
                                            ) : <span className="text-sm text-[#64748B]">{bug.priority}</span>}
                                        </td>
                                        <td className="px-4 py-2.5">
                                            {canEditStatus ? (
                                                <InlineSelectCell
                                                    value={bug.status}
                                                    options={nextStatuses(bug.status).map(s => ({ value: s, label: s, icon: <Dot color={STATUS_COLOR[s]} /> }))}
                                                    accentColor={STATUS_COLOR[bug.status]}
                                                    loading={isSaving('status')}
                                                    onChange={(v) => onInlineUpdate(bug.id, 'status', v)}
                                                />
                                            ) : <StatusBadge status={bug.status} />}
                                        </td>
                                        <td className="px-4 py-2.5 whitespace-nowrap">
                                            {canEditClassified ? (
                                                <InlineAssigneeCell
                                                    assigneeId={bug.assigneeId || ''}
                                                    assigneeName={bug.assignee}
                                                    members={members}
                                                    loading={isSaving('assignee')}
                                                    onChange={(v) => onInlineUpdate(bug.id, 'assignee', v)}
                                                />
                                            ) : <span className="text-sm text-[#64748B]">{bug.assignee}</span>}
                                        </td>
                                        <td className="px-4 py-2.5 text-sm text-right">
                                            <span className={`font-semibold ${bug.age > 15 ? 'text-[#EF4444]' : bug.age > 7 ? 'text-[#F97316]' : 'text-[#64748B]'}`}>{bug.age}d</span>
                                        </td>
                                        <td className="px-4 py-2.5 text-center">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onViewBug(bug.id); }}
                                                disabled={loadingBug}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#06B6D4] hover:bg-[#ECFEFF] transition-colors disabled:opacity-50"
                                            >
                                                {loadingBug ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                                                View
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                {filteredBugs.length > 0 && (
                    <Pagination
                        page={page}
                        totalPages={totalPages}
                        totalItems={totalItems}
                        startIdx={startIdx}
                        endIdx={endIdx}
                        pageSize={pageSize}
                        onPageChange={setPage}
                        onPageSizeChange={setPageSize}
                        rangeSuffix={layerFilter !== 'All' ? <span className="text-[#06B6D4]"> in {layerFilter}</span> : undefined}
                    />
                )}
            </div>

            {/* Paste Bugs Dialog */}
            {showAddBugDialog && (
                <PasteBugsDialog
                    projectName={project || ''}
                    open={showAddBugDialog}
                    onClose={() => setShowAddBugDialog(false)}
                    onSaved={handleBugSaved}
                />
            )}
        </>
    );
}

/* ═══════════════════════════════════════════════════ */
/* ═══ SHARED COMPONENTS ══════════════════════════════ */
/* ═══════════════════════════════════════════════════ */

function TabButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
    return (
        <button
            onClick={onClick}
            className={`flex items-center gap-2 px-4 h-9 rounded-lg text-sm font-medium transition-all ${active ? 'bg-white text-[#0F172A] shadow-sm' : 'text-[#64748B] hover:text-[#1E293B]'
                }`}
        >
            {icon}
            {children}
        </button>
    );
}

function KPICard({ icon, label, value, color, bgColor }: { icon: React.ReactNode; label: string; value: string; color: string; bgColor: string }) {
    return (
        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-4 hover:shadow-md transition-shadow">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ background: bgColor, color }}>
                {icon}
            </div>
            <p className="text-2xl font-bold text-[#0F172A] tracking-tight">{value}</p>
            <p className="text-xs text-[#64748B] mt-1">{label}</p>
        </div>
    );
}

function CriticalBugTable({ title, icon, bugs, accentColor, onViewBug }: { title: string; icon: React.ReactNode; bugs: BugItem[]; accentColor: string; onViewBug?: (bugId: string) => void }) {
    return (
        <div className="bg-white rounded-2xl border border-[#E2E8F0] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E2E8F0] flex items-center gap-2" style={{ borderLeft: `3px solid ${accentColor}` }}>
                {icon}
                <h3 className="text-base font-semibold text-[#1E293B]">{title}</h3>
                <span className="ml-auto inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-[#FEF2F2] text-[#EF4444]">
                    {bugs.filter(b => b.status === 'Open').length} Open
                </span>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                            <th className="text-left px-4 py-2 text-xs font-semibold text-[#64748B] uppercase">Bug ID</th>
                            <th className="text-left px-4 py-2 text-xs font-semibold text-[#64748B] uppercase">Title</th>
                            <th className="text-left px-4 py-2 text-xs font-semibold text-[#64748B] uppercase">Status</th>
                            <th className="text-right px-4 py-2 text-xs font-semibold text-[#64748B] uppercase">Age</th>
                        </tr>
                    </thead>
                    <tbody>
                        {bugs.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="py-2">
                                    <EmptyState compact icon={Bug} title="No critical bugs" description="Critical bugs will appear here when reported." />
                                </td>
                            </tr>
                        ) : bugs.map(bug => (
                            <tr key={bug.id} onClick={() => onViewBug?.(bug.id)} className={`border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition-colors ${onViewBug ? 'cursor-pointer' : ''}`}>
                                <td className="px-4 py-2.5 text-sm font-mono font-medium text-[#06B6D4]">{bug.id}</td>
                                <td className="px-4 py-2.5 text-sm text-[#1E293B] max-w-xs truncate">{bug.title}</td>
                                <td className="px-4 py-2.5"><StatusBadge status={bug.status} /></td>
                                <td className="px-4 py-2.5 text-sm text-right">
                                    <span className={`font-semibold ${bug.age > 5 ? 'text-[#EF4444]' : 'text-[#64748B]'}`}>{bug.age}d</span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function TeamAnalytics({ title, icon, team, accentColor }: { title: string; icon: React.ReactNode; team: { name: string; assigned: number; open: number; resolved: number }[]; accentColor: string }) {
    return (
        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-6">
            <div className="flex items-center gap-2 mb-4">
                <span style={{ color: accentColor }}>{icon}</span>
                <h3 className="text-base font-semibold text-[#1E293B]">{title}</h3>
            </div>
            <div className="space-y-3">
                {team.map(member => (
                    <div key={member.name} className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0" style={{ background: `${accentColor}20`, color: accentColor }}>
                            {member.name.replace('Dev ', 'D')}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-sm font-medium text-[#1E293B]">{member.name}</span>
                                <div className="flex items-center gap-3 text-xs">
                                    <span className="text-[#64748B]">{member.assigned} assigned</span>
                                    <span className="text-[#EF4444]">{member.open} open</span>
                                    <span className="text-[#22C55E]">{member.resolved} resolved</span>
                                </div>
                            </div>
                            <div className="h-2 bg-[#F1F5F9] rounded-full overflow-hidden flex">
                                <div className="h-full" style={{ width: `${(member.open / member.assigned) * 100}%`, background: '#EF4444' }} />
                                <div className="h-full" style={{ width: `${(member.resolved / member.assigned) * 100}%`, background: '#22C55E' }} />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
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

function LayerBadge({ layer }: { layer: BugLayer }) {
    const colors: Record<BugLayer, string> = {
        Frontend: 'bg-[#EFF6FF] text-[#3B82F6]',
        Backend: 'bg-[#F5F3FF] text-[#8B5CF6]',
        Integration: 'bg-[#ECFEFF] text-[#06B6D4]',
        Mobile: 'bg-[#FFF7ED] text-[#F97316]',
        Infrastructure: 'bg-[#F8FAFC] text-[#64748B]',
    };
    return <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium ${colors[layer]}`}>{layer}</span>;
}

function SeverityBadge({ severity }: { severity: string }) {
    const colors: Record<string, string> = {
        Critical: 'bg-[#FEF2F2] text-[#EF4444]',
        High: 'bg-[#FFF7ED] text-[#F97316]',
        Medium: 'bg-[#FEFCE8] text-[#F59E0B]',
        Low: 'bg-[#F0FDF4] text-[#22C55E]',
    };
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${colors[severity] || colors.Medium}`}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'currentColor' }} />
            {severity}
        </span>
    );
}

function StatusBadge({ status }: { status: string }) {
    const styles: Record<string, string> = {
        Open: 'bg-[#FEF2F2] text-[#EF4444]',
        Assigned: 'bg-[#FFF7ED] text-[#F97316]',
        'In Progress': 'bg-[#EFF6FF] text-[#3B82F6]',
        Fixed: 'bg-[#F5F3FF] text-[#8B5CF6]',
        'Ready For QA': 'bg-[#ECFEFF] text-[#06B6D4]',
        Verified: 'bg-[#F0FDF4] text-[#22C55E]',
        Closed: 'bg-[#F8FAFC] text-[#64748B]',
    };
    return <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium ${styles[status] || styles.Open}`}>{status}</span>;
}
