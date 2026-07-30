'use client';

/**
 * Project Management — list page (the central hub).
 *
 * Shows summary cards, a searchable/filterable table of projects, and entry points
 * to create, edit, archive and (guarded) delete projects.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, RefreshCw, Loader2, FolderKanban, AlertCircle } from 'lucide-react';
import { AppShell, PageContainer } from '@/components/layout';
import { Button } from '@/components/core';
import { Pagination, usePagination } from '@/components/ui/Pagination';
import { ProjectSummaryCards } from '@/features/project-management/components/ProjectSummaryCards';
import { ProjectFilters } from '@/features/project-management/components/ProjectFilters';
import { ProjectTable } from '@/features/project-management/components/ProjectTable';
import { ProjectFormModal } from '@/features/project-management/components/ProjectFormModal';
import { ProjectConfirmDialog } from '@/features/project-management/components/ProjectConfirmDialog';
import { projectService } from '@/features/project-management/services/project.service';
import { useProject } from '@/features/project-management/ProjectContext';
import { useToast } from '@/components/ui/Toast';
import {
    ProjectFilter,
    ProjectSummary,
    ProjectWithStats,
} from '@/features/project-management/types';

type ConfirmState =
    | { kind: 'archive'; project: ProjectWithStats }
    | { kind: 'delete'; project: ProjectWithStats; warnings: string[]; canDelete: boolean }
    | null;

export default function ProjectsPage() {
    const router = useRouter();
    const { refreshProjects } = useProject();

    const [projects, setProjects] = useState<ProjectWithStats[]>([]);
    const [summary, setSummary] = useState<ProjectSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    const [filter, setFilter] = useState<ProjectFilter>({ search: '', status: undefined, projectType: undefined });

    const [showCreate, setShowCreate] = useState(false);
    const [editTarget, setEditTarget] = useState<ProjectWithStats | null>(null);
    const [confirm, setConfirm] = useState<ConfirmState>(null);
    const [confirmLoading, setConfirmLoading] = useState(false);
    const toast = useToast();

    // Debounced search value used for the actual fetch.
    const [debouncedSearch, setDebouncedSearch] = useState(filter.search ?? '');
    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(filter.search ?? ''), 300);
        return () => clearTimeout(t);
    }, [filter.search]);

    const loadList = useCallback(async () => {
        setLoading(true);
        setError(false);
        try {
            const result = await projectService.listProjects({
                ...filter,
                search: debouncedSearch,
            });
            if (result.success && result.data) {
                setProjects(result.data);
            } else {
                // A failed fetch is an ERROR, not an empty list — surface a retry.
                setProjects([]);
                setError(true);
            }
        } catch {
            setProjects([]);
            setError(true);
        } finally {
            setLoading(false);
        }
    }, [filter.status, filter.projectType, debouncedSearch]);

    const loadSummary = useCallback(async () => {
        const result = await projectService.getProjectSummary();
        if (result.success && result.data) setSummary(result.data);
    }, []);

    useEffect(() => { loadList(); }, [loadList]);
    useEffect(() => { loadSummary(); }, [loadSummary]);

    // Client-side pagination over the already-filtered list. Reset to page 1 when filters change.
    const filterKey = `${filter.status ?? ''}|${filter.projectType ?? ''}|${debouncedSearch}`;
    const pagination = usePagination(projects, 10, filterKey);

    // Whether any search/status/type filter is active — drives the empty-state copy.
    const hasActiveFilters = !!(debouncedSearch || filter.status || filter.projectType);
    const clearFilters = () => setFilter({ search: '', status: undefined, projectType: undefined });

    const refreshAll = useCallback(async () => {
        setRefreshing(true);
        await Promise.all([loadList(), loadSummary(), refreshProjects()]);
        setRefreshing(false);
    }, [loadList, loadSummary, refreshProjects]);

    // ── Row actions ────────────────────────────────────
    const handleView = (p: ProjectWithStats) => router.push(`/projects/${encodeURIComponent(p.id)}`);
    const handleEdit = (p: ProjectWithStats) => setEditTarget(p);

    const handleArchiveRequest = (p: ProjectWithStats) => setConfirm({ kind: 'archive', project: p });

    const handleDeleteRequest = async (p: ProjectWithStats) => {
        const check = await projectService.getDeleteCheck(p.id);
        setConfirm({
            kind: 'delete',
            project: p,
            warnings: check.success && check.data ? check.data.warnings : [],
            canDelete: check.success && check.data ? check.data.canDelete : false,
        });
    };

    const handleConfirm = async () => {
        if (!confirm) return;
        setConfirmLoading(true);
        try {
            if (confirm.kind === 'archive') {
                const res = await projectService.archiveProject(confirm.project.id);
                if (res.success) {
                    toast.success(`Archived "${confirm.project.projectName}".`);
                } else {
                    toast.error(res.error || 'Failed to archive project.');
                }
            } else {
                // Delete — force only when the project has associated data the user accepts to purge.
                const res = await projectService.deleteProject(confirm.project.id, !confirm.canDelete);
                if (res.success) {
                    toast.success(`Deleted "${confirm.project.projectName}".`);
                } else {
                    toast.error(res.error || 'Failed to delete project.');
                }
            }
        } finally {
            setConfirmLoading(false);
            setConfirm(null);
            refreshAll();
        }
    };

    return (
        <AppShell>
            <PageContainer>
                <div className="space-y-6">
                    {/* Header */}
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div>
                            <h1 className="text-2xl font-bold text-[#0F172A] tracking-tight flex items-center gap-2.5">
                                <FolderKanban className="w-6 h-6 text-[#06B6D4]" />
                                Project Management
                            </h1>
                            <p className="text-sm text-[#64748B] mt-1">
                                Central hub — every bug, test case and report belongs to a project.
                            </p>
                        </div>
                        <div className="flex items-center gap-3">
                            <Button variant="secondary" size="sm" onClick={refreshAll} disabled={refreshing} leftIcon={refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}>
                                Refresh
                            </Button>
                            <Button size="sm" onClick={() => setShowCreate(true)} leftIcon={<Plus className="w-4 h-4" />}>
                                New Project
                            </Button>
                        </div>
                    </div>

                    {/* Summary cards */}
                    <ProjectSummaryCards summary={summary} />

                    {/* Filters */}
                    <ProjectFilters filter={filter} onFilterChange={setFilter} />

                    {/* Result count */}
                    <div className="flex items-center justify-between">
                        <p className="text-sm text-[#64748B]">
                            {loading ? (
                                'Loading projects…'
                            ) : error ? null : (
                                <>Showing <span className="font-semibold text-[#1E293B]">{projects.length}</span> project{projects.length === 1 ? '' : 's'}</>
                            )}
                        </p>
                    </div>

                    {/* Table */}
                    {loading ? (
                        <div role="status" aria-live="polite" className="flex flex-col items-center justify-center py-20">
                            <Loader2 className="w-8 h-8 text-[#06B6D4] animate-spin mb-3" />
                            <p className="text-sm text-[#64748B]">Loading projects…</p>
                        </div>
                    ) : error ? (
                        <div role="alert" className="flex flex-col items-center justify-center py-20 text-center">
                            <AlertCircle className="w-8 h-8 text-[#EF4444] mb-3" />
                            <p className="text-sm font-semibold text-[#1E293B] mb-1">Couldn&apos;t load projects</p>
                            <p className="text-sm text-[#64748B] mb-4">Something went wrong while fetching your projects.</p>
                            <Button variant="secondary" size="sm" onClick={() => loadList()} leftIcon={<RefreshCw className="w-4 h-4" />}>
                                Retry
                            </Button>
                        </div>
                    ) : (
                        <ProjectTable
                            projects={pagination.paginatedItems}
                            onView={handleView}
                            onEdit={handleEdit}
                            onArchive={handleArchiveRequest}
                            onDelete={handleDeleteRequest}
                            hasActiveFilters={hasActiveFilters}
                            onCreate={() => setShowCreate(true)}
                            onClearFilters={clearFilters}
                            footer={
                                pagination.totalItems > 0 ? (
                                    <Pagination
                                        page={pagination.page}
                                        totalPages={pagination.totalPages}
                                        totalItems={pagination.totalItems}
                                        startIdx={pagination.startIdx}
                                        endIdx={pagination.endIdx}
                                        pageSize={pagination.pageSize}
                                        onPageChange={pagination.setPage}
                                        onPageSizeChange={pagination.setPageSize}
                                    />
                                ) : undefined
                            }
                        />
                    )}
                </div>
            </PageContainer>

            {/* Create modal */}
            {showCreate && (
                <ProjectFormModal
                    onClose={() => setShowCreate(false)}
                    onSaved={() => {
                        setShowCreate(false);
                        toast.success('Project created successfully.');
                        refreshAll();
                    }}
                />
            )}

            {/* Edit modal */}
            {editTarget && (
                <ProjectFormModal
                    project={editTarget}
                    onClose={() => setEditTarget(null)}
                    onSaved={() => {
                        setEditTarget(null);
                        toast.success('Project updated successfully.');
                        refreshAll();
                    }}
                />
            )}

            {/* Confirm (archive / delete) */}
            {confirm && (
                <ProjectConfirmDialog
                    title={confirm.kind === 'archive' ? 'Archive Project' : 'Delete Project'}
                    message={
                        confirm.kind === 'archive'
                            ? `Archive "${confirm.project.projectName}"? Archived projects become read-only — you won't be able to create bugs or generate test cases for it. You can restore it anytime.`
                            : confirm.canDelete
                                ? `Permanently delete "${confirm.project.projectName}"? This cannot be undone.`
                                : `"${confirm.project.projectName}" has associated data. Deleting it will remove the project record. We recommend archiving instead.`
                    }
                    warnings={confirm.kind === 'delete' ? confirm.warnings : []}
                    confirmLabel={confirm.kind === 'archive' ? 'Archive' : confirm.canDelete ? 'Delete' : 'Force Delete'}
                    secondaryLabel={confirm.kind === 'delete' && !confirm.canDelete ? 'Archive instead' : undefined}
                    loading={confirmLoading}
                    onConfirm={handleConfirm}
                    onSecondary={
                        confirm.kind === 'delete' && !confirm.canDelete
                            ? () => {
                                const p = confirm.project;
                                setConfirm(null);
                                handleArchiveRequest(p);
                            }
                            : undefined
                    }
                    onClose={() => setConfirm(null)}
                />
            )}
        </AppShell>
    );
}
