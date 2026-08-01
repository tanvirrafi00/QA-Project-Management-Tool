'use client';

import { Eye, Pencil, Archive, Trash2 } from 'lucide-react';
import { ProjectWithStats } from '../types';
import { EmptyProjects, EmptySearch } from '@/components/states';
import { formatStat, safeNumber } from '@/lib/safe-value';

interface ProjectTableProps {
    projects: ProjectWithStats[];
    onView: (project: ProjectWithStats) => void;
    onEdit: (project: ProjectWithStats) => void;
    onArchive: (project: ProjectWithStats) => void;
    onDelete: (project: ProjectWithStats) => void;
    /** Optional footer (e.g. pagination) rendered inside the card, below the table. */
    footer?: React.ReactNode;
    /** True when a search/status/type filter is active — switches empty state copy. */
    hasActiveFilters?: boolean;
    /** Open the create-project modal (used by the "no projects at all" empty state). */
    onCreate?: () => void;
    /** Clear all filters (used by the "filters returned nothing" empty state). */
    onClearFilters?: () => void;
}

function StatusBadge({ status }: { status: string }) {
    const isActive = status === 'Active';
    return (
        <span
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium ${isActive ? 'bg-[#ECFDF5] text-[#10B981]' : 'bg-[#F8FAFC] text-[#64748B]'
                }`}
        >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'currentColor' }} />
            {status}
        </span>
    );
}

function TypeBadge({ type }: { type: string }) {
    const palette: Record<string, string> = {
        'Web Application': 'bg-[#EFF6FF] text-[#3B82F6]',
        'Mobile Application': 'bg-[#FFF7ED] text-[#F97316]',
        API: 'bg-[#ECFEFF] text-[#06B6D4]',
        Microservices: 'bg-[#F5F3FF] text-[#8B5CF6]',
        Other: 'bg-[#F8FAFC] text-[#64748B]',
    };
    return (
        <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium ${palette[type] ?? palette.Other}`}>
            {type}
        </span>
    );
}

function formatDate(iso: string): string {
    try {
        return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
        return iso;
    }
}

export function ProjectTable({
    projects,
    onView,
    onEdit,
    onArchive,
    onDelete,
    footer,
    hasActiveFilters = false,
    onCreate,
    onClearFilters,
}: ProjectTableProps) {
    if (projects.length === 0) {
        return (
            <div className="bg-white rounded-2xl border border-[#E2E8F0]">
                <div className="p-12">
                    {hasActiveFilters ? (
                        <EmptySearch onClear={onClearFilters} />
                    ) : (
                        <EmptyProjects onCreate={onCreate} />
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-2xl border border-[#E2E8F0] overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                            <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wider whitespace-nowrap">Project</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wider whitespace-nowrap">Code</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wider whitespace-nowrap">Type</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wider whitespace-nowrap">Status</th>
                            <th className="text-center px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wider whitespace-nowrap">Bugs</th>
                            <th className="text-center px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wider whitespace-nowrap">Test Cases</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wider whitespace-nowrap">Created</th>
                            <th className="text-center px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wider whitespace-nowrap">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {projects.map(project => {
                            const isArchived = project.status === 'Archived';
                            return (
                                <tr
                                    key={project.id}
                                    className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition-colors cursor-pointer"
                                    onClick={() => onView(project)}
                                >
                                    <td className="px-4 py-3">
                                        <div className="text-sm font-semibold text-[#1E293B] truncate max-w-[200px]" title={project.projectName}>
                                            {project.projectName}
                                        </div>
                                        {project.description && (
                                            <div className="text-xs text-[#94A3B8] truncate max-w-[200px]" title={project.description}>
                                                {project.description}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="text-xs font-mono font-semibold text-[#06B6D4] px-2 py-1 rounded-md bg-[#ECFEFF]">
                                            {project.projectCode}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3"><TypeBadge type={project.projectType} /></td>
                                    <td className="px-4 py-3"><StatusBadge status={project.status} /></td>
                                    <td className="px-4 py-3 text-center">
                                        <span className="text-sm font-semibold text-[#1E293B]">{formatStat(project.statistics?.totalBugs)}</span>
                                        {safeNumber(project.statistics?.openBugs) > 0 && (
                                            <span className="block text-[10px] text-[#EF4444]">{safeNumber(project.statistics?.openBugs)} open</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <span className="text-sm font-semibold text-[#1E293B]">{formatStat(project.statistics?.totalTestCases)}</span>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-[#64748B] whitespace-nowrap">{formatDate(project.createdAt)}</td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center justify-center gap-1">
                                            <IconAction title="View" onClick={(e) => { e.stopPropagation(); onView(project); }}>
                                                <Eye className="w-3.5 h-3.5" />
                                            </IconAction>
                                            <IconAction title="Edit" onClick={(e) => { e.stopPropagation(); onEdit(project); }}>
                                                <Pencil className="w-3.5 h-3.5" />
                                            </IconAction>
                                            {!isArchived ? (
                                                <IconAction title="Archive" onClick={(e) => { e.stopPropagation(); onArchive(project); }}>
                                                    <Archive className="w-3.5 h-3.5" />
                                                </IconAction>
                                            ) : null}
                                            <IconAction title="Delete" danger onClick={(e) => { e.stopPropagation(); onDelete(project); }}>
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </IconAction>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            {footer}
        </div>
    );
}

function IconAction({
    title,
    onClick,
    danger,
    children,
}: {
    title: string;
    onClick: (e: React.MouseEvent) => void;
    danger?: boolean;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            title={title}
            aria-label={title}
            onClick={onClick}
            className={`w-7 h-7 inline-flex items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#06B6D4]/40 ${danger
                ? 'text-[#94A3B8] hover:text-[#DC2626] hover:bg-[#FEF2F2]'
                : 'text-[#94A3B8] hover:text-[#06B6D4] hover:bg-[#ECFEFF]'
                }`}
        >
            {children}
        </button>
    );
}
