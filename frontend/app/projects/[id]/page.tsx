'use client';

/**
 * Project Details page.
 *
 * Overview + live statistics + quick actions (navigate to a module — each module
 * owns its own project selection now) + an audit history timeline.
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
    ArrowLeft, Pencil, Archive, RotateCcw, Loader2, Bug, FlaskConical,
    BarChart3, FileText, Plus, CheckCircle2, AlertTriangle, AlertCircle, RefreshCw, Calendar, User, Tag,
} from 'lucide-react';
import { AppShell, PageContainer } from '@/components/layout';
import { Button } from '@/components/core';
import { ProjectFormModal } from '@/features/project-management/components/ProjectFormModal';
import { ProjectConfirmDialog } from '@/features/project-management/components/ProjectConfirmDialog';
import { projectService } from '@/features/project-management/services/project.service';
import { useToast } from '@/components/ui/Toast';
import {
    ProjectHistoryEntry,
    ProjectWithStats,
} from '@/features/project-management/types';

function formatDate(iso: string): string {
    try {
        return new Date(iso).toLocaleString('en-US', {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit',
        });
    } catch {
        return iso;
    }
}

function typeBadgeClass(type: string): string {
    const palette: Record<string, string> = {
        'Web Application': 'bg-[#EFF6FF] text-[#3B82F6]',
        'Mobile Application': 'bg-[#FFF7ED] text-[#F97316]',
        API: 'bg-[#ECFEFF] text-[#06B6D4]',
        Microservices: 'bg-[#F5F3FF] text-[#8B5CF6]',
        Other: 'bg-[#F8FAFC] text-[#64748B]',
    };
    return palette[type] ?? palette.Other;
}

export default function ProjectDetailsPage() {
    const params = useParams();
    const router = useRouter();
    const id = String(params?.id ?? '');

    const [project, setProject] = useState<ProjectWithStats | null>(null);
    const [history, setHistory] = useState<ProjectHistoryEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [error, setError] = useState(false);

    const [showEdit, setShowEdit] = useState(false);
    const [confirmArchive, setConfirmArchive] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const toast = useToast();

    const load = useCallback(async () => {
        setLoading(true);
        setError(false);
        try {
            const [projRes, histRes] = await Promise.all([
                projectService.getProject(id),
                projectService.getProjectHistory(id),
            ]);
            if (!projRes.success || !projRes.data) {
                setNotFound(true);
            } else {
                setProject(projRes.data);
            }
            setHistory(histRes.success && histRes.data ? histRes.data : []);
        } catch {
            // A thrown fetch is an error (retry), not "not found".
            setError(true);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => { if (id) load(); }, [load]);

    const navigateTo = (path: string) => {
        router.push(path);
    };

    const handleArchiveToggle = async () => {
        if (!project) return;
        setActionLoading(true);
        try {
            const res = project.status === 'Active'
                ? await projectService.archiveProject(project.id)
                : await projectService.restoreProject(project.id);
            if (res.success && res.data) {
                setProject({ ...project, ...res.data, statistics: project.statistics });
                toast.success(project.status === 'Active' ? 'Project archived.' : 'Project restored.');
            } else {
                toast.error(res.error || 'Action failed.');
            }
        } finally {
            setActionLoading(false);
            setConfirmArchive(false);
        }
    };

    if (loading) {
        return (
            <AppShell>
                <PageContainer>
                    <div role="status" aria-live="polite" className="flex flex-col items-center justify-center py-20">
                        <Loader2 className="w-8 h-8 text-[#06B6D4] animate-spin mb-3" />
                        <p className="text-sm text-[#64748B]">Loading project…</p>
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
                        <h2 className="text-base font-semibold text-[#1E293B]">Couldn&apos;t load project</h2>
                        <p className="text-sm text-[#64748B] mt-1">Something went wrong while fetching this project.</p>
                        <div className="flex items-center justify-center gap-3 mt-4">
                            <Button variant="secondary" size="sm" onClick={() => load()} leftIcon={<RefreshCw className="w-4 h-4" />}>
                                Retry
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => router.push('/projects')} leftIcon={<ArrowLeft className="w-4 h-4" />}>
                                Back to Projects
                            </Button>
                        </div>
                    </div>
                </PageContainer>
            </AppShell>
        );
    }

    if (notFound || !project) {
        return (
            <AppShell>
                <PageContainer>
                    <div className="bg-white rounded-2xl border border-[#E2E8F0] p-12 text-center">
                        <AlertTriangle className="w-8 h-8 text-[#F59E0B] mx-auto mb-3" />
                        <h2 className="text-base font-semibold text-[#1E293B]">Project not found</h2>
                        <p className="text-sm text-[#64748B] mt-1">It may have been deleted.</p>
                        <Button variant="secondary" size="sm" className="mt-4" onClick={() => router.push('/projects')} leftIcon={<ArrowLeft className="w-4 h-4" />}>
                            Back to Projects
                        </Button>
                    </div>
                </PageContainer>
            </AppShell>
        );
    }

    const isArchived = project.status === 'Archived';
    const s = project.statistics;

    return (
        <AppShell>
            <PageContainer>
                <div className="space-y-6">
                    {/* Breadcrumb + actions */}
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                        <button
                            onClick={() => router.push('/projects')}
                            className="inline-flex items-center gap-1.5 text-sm text-[#64748B] hover:text-[#06B6D4] transition-colors"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            All Projects
                        </button>
                        <div className="flex items-center gap-3">
                            <Button variant="secondary" size="sm" onClick={() => setShowEdit(true)} leftIcon={<Pencil className="w-4 h-4" />}>
                                Edit
                            </Button>
                            <Button
                                variant={isArchived ? 'success' : 'danger'}
                                size="sm"
                                onClick={() => (isArchived ? handleArchiveToggle() : setConfirmArchive(true))}
                                disabled={actionLoading}
                                leftIcon={isArchived ? <RotateCcw className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                            >
                                {isArchived ? 'Restore' : 'Archive'}
                            </Button>
                        </div>
                    </div>

                    {/* Overview header */}
                    <div className="bg-white rounded-2xl border border-[#E2E8F0] p-6">
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                            <div className="min-w-0">
                                <div className="flex items-center gap-3 flex-wrap">
                                    <h1 className="text-2xl font-bold text-[#0F172A] tracking-tight">{project.projectName}</h1>
                                    <span className="text-xs font-mono font-semibold text-[#06B6D4] px-2 py-1 rounded-md bg-[#ECFEFF]">{project.projectCode}</span>
                                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium ${isArchived ? 'bg-[#F8FAFC] text-[#64748B]' : 'bg-[#ECFDF5] text-[#10B981]'}`}>
                                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'currentColor' }} />
                                        {project.status}
                                    </span>
                                    <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium ${typeBadgeClass(project.projectType)}`}>{project.projectType}</span>
                                </div>
                                {project.description && (
                                    <p className="text-sm text-[#64748B] mt-3 max-w-2xl leading-relaxed">{project.description}</p>
                                )}
                                <div className="flex items-center gap-5 mt-4 text-xs text-[#94A3B8] flex-wrap">
                                    <span className="inline-flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> {project.createdBy}</span>
                                    <span className="inline-flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Created {formatDate(project.createdAt)}</span>
                                    <span className="inline-flex items-center gap-1.5"><Tag className="w-3.5 h-3.5" /> v{project.version}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Quick actions */}
                    <div className="bg-gradient-to-br from-[#0F172A] to-[#1E293B] rounded-2xl p-6 text-white">
                        <div className="flex items-center gap-2 mb-4">
                            <Plus className="w-4 h-4 text-[#06B6D4]" />
                            <h3 className="text-sm font-semibold uppercase tracking-wide text-[#94A3B8]">Quick Actions</h3>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <QuickAction icon={<FlaskConical className="w-4 h-4" />} label="Generate Test Cases" onClick={() => navigateTo('/test-cases')} disabled={isArchived} />
                            <QuickAction icon={<Bug className="w-4 h-4" />} label="Generate Bug" onClick={() => navigateTo('/bug-generator')} disabled={isArchived} />
                            <QuickAction icon={<BarChart3 className="w-4 h-4" />} label="View Bugs" onClick={() => navigateTo('/bug-dashboard')} />
                            <QuickAction icon={<FileText className="w-4 h-4" />} label="View Reports" onClick={() => navigateTo('/history')} />
                        </div>
                        {isArchived && (
                            <p className="text-xs text-[#FBBF24] mt-3 flex items-center gap-1.5">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                This project is archived — restore it to generate new bugs or test cases.
                            </p>
                        )}
                    </div>

                    {/* Statistics */}
                    <div>
                        <h3 className="text-sm font-semibold text-[#475569] uppercase tracking-wide mb-3">Project Statistics</h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                            <StatTile label="Total Bugs" value={s.totalBugs} icon={<Bug className="w-5 h-5" />} color="#3B82F6" bg="#EFF6FF" />
                            <StatTile label="Open Bugs" value={s.openBugs} icon={<AlertTriangle className="w-5 h-5" />} color="#EF4444" bg="#FEF2F2" />
                            <StatTile label="Critical Bugs" value={s.criticalBugs} icon={<AlertTriangle className="w-5 h-5" />} color="#DC2626" bg="#FEF2F2" />
                            <StatTile label="Total Test Cases" value={s.totalTestCases} icon={<FlaskConical className="w-5 h-5" />} color="#06B6D4" bg="#ECFEFF" />
                            <StatTile label="Generated" value={s.generatedTestCases} icon={<CheckCircle2 className="w-5 h-5" />} color="#10B981" bg="#ECFDF5" />
                        </div>
                    </div>

                    {/* Audit history */}
                    <div className="bg-white rounded-2xl border border-[#E2E8F0] p-6">
                        <h3 className="text-sm font-semibold text-[#475569] uppercase tracking-wide mb-4">Audit History</h3>
                        {history.length === 0 ? (
                            <p className="text-sm text-[#94A3B8]">No changes recorded yet.</p>
                        ) : (
                            <ol className="relative border-l border-[#E2E8F0] ml-1 space-y-5">
                                {[...history].reverse().map(entry => (
                                    <li key={entry.id} className="pl-5 relative">
                                        <span className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-[#06B6D4]" />
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-sm font-semibold text-[#1E293B]">{labelizeField(entry.changedField)}</span>
                                            <span className="text-xs text-[#94A3B8]">· {formatDate(entry.changedAt)}</span>
                                        </div>
                                        <div className="text-xs text-[#64748B] mt-1">
                                            <span className="line-through text-[#CBD5E1]">{entry.oldValue || '∅'}</span>
                                            <span className="mx-2 text-[#06B6D4]">→</span>
                                            <span className="font-medium text-[#1E293B]">{entry.newValue || '∅'}</span>
                                        </div>
                                        <div className="text-[11px] text-[#94A3B8] mt-0.5">by {entry.changedBy}</div>
                                    </li>
                                ))}
                            </ol>
                        )}
                    </div>
                </div>
            </PageContainer>

            {/* Edit modal */}
            {showEdit && (
                <ProjectFormModal
                    project={project}
                    onClose={() => setShowEdit(false)}
                    onSaved={() => {
                        setShowEdit(false);
                        toast.success('Project updated.');
                        load();
                    }}
                />
            )}

            {/* Archive confirm */}
            {confirmArchive && (
                <ProjectConfirmDialog
                    title="Archive Project"
                    message={`Archive "${project.projectName}"? It becomes read-only. You can restore it anytime.`}
                    confirmLabel="Archive"
                    loading={actionLoading}
                    onConfirm={handleArchiveToggle}
                    onClose={() => setConfirmArchive(false)}
                />
            )}
        </AppShell>
    );
}

function QuickAction({ icon, label, onClick, disabled }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className="flex items-center gap-2.5 px-4 h-11 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-[#06B6D4]/40 transition-all text-sm font-medium text-white disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white/5 disabled:hover:border-white/10"
        >
            <span className="text-[#06B6D4]">{icon}</span>
            {label}
        </button>
    );
}

function StatTile({ label, value, icon, color, bg }: { label: string; value: number; icon: React.ReactNode; color: string; bg: string }) {
    return (
        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ background: bg, color }}>
                {icon}
            </div>
            <div className="text-2xl font-bold text-[#0F172A] tracking-tight">{value}</div>
            <div className="text-xs text-[#64748B] mt-1">{label}</div>
        </div>
    );
}

function labelizeField(field: string): string {
    switch (field) {
        case 'projectName': return 'Name';
        case 'projectType': return 'Type';
        case 'description': return 'Description';
        case 'status': return 'Status';
        default: return field;
    }
}
