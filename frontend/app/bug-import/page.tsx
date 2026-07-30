'use client';

/**
 * Bug Import Page
 *
 * Single-sheet XLSX import — a flat list of bugs saved into the selected project.
 * Flow: Upload (drag & drop) → backend parse + validate (strict all-or-nothing) → preview → Save.
 *
 * Imported bugs are saved through the same repository path as manual/AI bugs, so they appear in the
 * Bug Dashboard list + analytics with no extra wiring.
 *
 * Data path (docs/api-standards.md §9):
 *   page → bugService.importBugs() → fetch('/api/bugs/import') [dedicated Route Handler]
 *        → backend multer + xlsx parse + validate → preview JSON.
 *   Save → bugService.saveImportedBugs() → /api/bugs/import/save [catch-all] → repository.
 */

import { useState, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell, PageContainer } from '@/components/layout';
import { Button } from '@/components/core';
import { Pagination, usePagination } from '@/components/ui/Pagination';
import { useModuleProject } from '@/features/project-management/hooks/useModuleProject';
import { ModuleProjectSelector } from '@/features/project-management/components/ModuleProjectSelector';
import { useToast } from '@/components/ui/Toast';
import { Alert } from '@/components/ui/Alert';
import { bugService } from '@/features/bug-management/services/bug.service';
import type { BugImportPreviewResponse } from '@/features/bug-management/services/bug.service';
import type { BugImportPreview, BugImportRow } from '@/features/bug-management/types';
import { SeverityBadge, StatusBadge, PriorityBadge } from '@/features/bug-management/components/BugBadges';
import * as XLSX from 'xlsx';
import {
    Upload, FileSpreadsheet, CheckCircle2, Loader2,
    Search, Download, ArrowLeft, Bug as BugIcon, FileCheck2, ClipboardList,
} from 'lucide-react';

type Stage = 'upload' | 'preview' | 'saving' | 'success';

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

/** The 12 canonical Excel columns (used for the template + the format-help chips). */
const TEMPLATE_COLUMNS = [
    'Bug ID', 'Module', 'Title / Summary', 'Severity', 'Priority', 'Description',
    'Steps to Reproduce', 'Expected Result', 'Actual Result',
    'Bug Impact Area', 'Status', 'Assigned To',
];

export default function BugImportPage() {
    const router = useRouter();
    const { projects, selectedProjectName, setSelectedProject, loading: projectsLoading } = useModuleProject('bug-import');
    const project = selectedProjectName;
    const toast = useToast();

    const [stage, setStage] = useState<Stage>('upload');
    const [isDragging, setIsDragging] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [fileName, setFileName] = useState<string>('');
    const [preview, setPreview] = useState<BugImportPreview | null>(null);
    const [error, setError] = useState<BugImportPreviewResponse | null>(null);
    const [savedCount, setSavedCount] = useState(0);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const reset = useCallback(() => {
        setStage('upload');
        setPreview(null);
        setError(null);
        setFileName('');
        if (fileInputRef.current) fileInputRef.current.value = '';
    }, []);

    const handleFile = useCallback(async (file: File) => {
        if (!project) return;
        setError(null);
        setFileName(file.name);

        // Client-side pre-validation (the backend re-validates authoritatively).
        if (!file.name.toLowerCase().endsWith('.xlsx')) {
            setError({ success: false, error: 'Invalid file format. Please upload an .xlsx file only.', errorType: 'INVALID_FILE' });
            return;
        }
        if (file.size > MAX_SIZE_BYTES) {
            setError({ success: false, error: 'File too large. Maximum allowed size is 10 MB.', errorType: 'INVALID_FILE' });
            return;
        }

        setUploading(true);
        const res = await bugService.importBugs(file, project);
        setUploading(false);

        if (res.success && res.data) {
            setPreview(res.data);
            setStage('preview');
        } else {
            setError(res);
        }
    }, [project]);

    const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        // Reset so selecting the SAME file again (e.g. after an error) still fires onChange.
        e.target.value = '';
        if (file) handleFile(file);
    };

    /** Clear the last error and re-open the file picker (no page refresh needed). */
    const retryUpload = useCallback(() => {
        setError(null);
        setFileName('');
        if (fileInputRef.current) fileInputRef.current.value = '';
        fileInputRef.current?.click();
    }, []);

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) handleFile(file);
    };

    const handleSave = async () => {
        if (!preview || !project) return;
        setStage('saving');
        const res = await bugService.saveImportedBugs({ projectName: project, bugs: preview.bugs });
        if (res.success && res.data) {
            setSavedCount(res.data.total);
            setStage('success');
        } else {
            toast.error(res.error || 'Failed to save the import. Please try again.');
            setStage('preview');
        }
    };

    const handleDownloadTemplate = () => {
        const example = [
            'BUG-001', 'Login', 'Login button unresponsive on mobile', 'High', 'P2',
            'The login button does not respond on small viewports.',
            'Open the login page on mobile\nTap the Sign In button', 'User is logged in',
            'Nothing happens', 'UI, Frontend', 'Open', 'Alice',
        ];
        const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_COLUMNS, example]);
        ws['!cols'] = TEMPLATE_COLUMNS.map(() => ({ wch: 20 }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Bugs');
        XLSX.writeFile(wb, 'bug-import-template.xlsx');
    };

    return (
        <AppShell>
            <PageContainer>
                <div className="space-y-6 pb-28">
                    {/* Header */}
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div>
                            <h1 className="text-2xl font-bold text-[#0F172A] tracking-tight">Import Bugs</h1>
                            <p className="text-sm text-[#64748B] mt-1">
                                Upload an Excel file of bug reports into the selected project.
                            </p>
                        </div>
                        <div className="flex items-center gap-3">
                            <ModuleProjectSelector
                                projects={projects}
                                value={selectedProjectName}
                                onChange={setSelectedProject}
                                loading={projectsLoading}
                            />
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={handleDownloadTemplate}
                                leftIcon={<Download className="w-4 h-4" />}
                            >
                                Download Template
                            </Button>
                        </div>
                    </div>

                    {/* No project selected */}
                    {!project ? (
                        <div className="flex flex-col items-center justify-center py-20">
                            <div className="w-14 h-14 rounded-2xl bg-[#F1F5F9] flex items-center justify-center mb-4">
                                <ClipboardList className="w-7 h-7 text-[#94A3B8]" />
                            </div>
                            <p className="text-base font-semibold text-[#1E293B] mb-1">No project selected</p>
                            <p className="text-sm text-[#64748B]">Choose a project from the dropdown above before importing.</p>
                        </div>
                    ) : stage === 'upload' ? (
                        <UploadStep
                            project={project}
                            isDragging={isDragging}
                            uploading={uploading}
                            fileName={fileName}
                            error={error}
                            fileInputRef={fileInputRef}
                            onBrowse={() => fileInputRef.current?.click()}
                            onInputChange={onInputChange}
                            onRetry={retryUpload}
                            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                            onDragLeave={() => setIsDragging(false)}
                            onDrop={onDrop}
                        />
                    ) : stage === 'preview' || stage === 'saving' ? (
                        <PreviewStep
                            project={project}
                            fileName={fileName}
                            preview={preview}
                            saving={stage === 'saving'}
                            onCancel={reset}
                            onSave={handleSave}
                        />
                    ) : (
                        <SuccessStep
                            project={project}
                            savedCount={savedCount}
                            onImportAnother={reset}
                            onViewBugs={() => router.push('/bug-dashboard')}
                        />
                    )}
                </div>
            </PageContainer>
        </AppShell>
    );
}

/* ═══════════════════════════════════════════════════ */
/* ═══ UPLOAD STEP ═══════════════════════════════════ */
/* ═══════════════════════════════════════════════════ */

function UploadStep({
    project, isDragging, uploading, fileName, error, fileInputRef,
    onBrowse, onInputChange, onRetry, onDragOver, onDragLeave, onDrop,
}: {
    project: string;
    isDragging: boolean;
    uploading: boolean;
    fileName: string;
    error: BugImportPreviewResponse | null;
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    onBrowse: () => void;
    onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onRetry: () => void;
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: () => void;
    onDrop: (e: React.DragEvent) => void;
}) {
    return (
        <div className="space-y-4">
            <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={onInputChange}
            />

            {/* Error panel — rendered at the TOP so failures are immediately visible, not buried below. */}
            {error && <ErrorPanel error={error} onRetry={onRetry} />}

            {/* Drop zone */}
            <div
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onClick={onBrowse}
                className={`cursor-pointer rounded-2xl border-2 border-dashed transition-all p-10 flex flex-col items-center justify-center text-center min-h-[260px] ${isDragging
                    ? 'border-[#06B6D4] bg-[#ECFEFF]'
                    : 'border-[#CBD5E1] bg-white hover:border-[#06B6D4] hover:bg-[#F8FAFC]'
                    }`}
            >
                {uploading ? (
                    <>
                        <Loader2 className="w-10 h-10 text-[#06B6D4] animate-spin mb-3" />
                        <p className="text-sm font-semibold text-[#1E293B]">Parsing & validating…</p>
                        <p className="text-xs text-[#64748B] mt-1">{fileName}</p>
                    </>
                ) : (
                    <>
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 ${isDragging ? 'bg-[#06B6D4] text-white' : 'bg-[#F1F5F9] text-[#06B6D4]'}`}>
                            <Upload className="w-7 h-7" />
                        </div>
                        <p className="text-base font-semibold text-[#1E293B]">
                            Drag & drop your XLSX file here
                        </p>
                        <p className="text-sm text-[#64748B] mt-1">or click to browse</p>
                        <div className="mt-5 flex items-center gap-2 text-xs text-[#94A3B8]">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#F1F5F9]">
                                <FileSpreadsheet className="w-3.5 h-3.5" /> .xlsx only
                            </span>
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#F1F5F9]">
                                Max 10 MB
                            </span>
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#F1F5F9]">
                                <BugIcon className="w-3.5 h-3.5" /> One sheet
                            </span>
                        </div>
                    </>
                )}
            </div>

            {/* Format help */}
            <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5">
                <h3 className="text-sm font-semibold text-[#1E293B] mb-2">Expected columns</h3>
                <p className="text-xs text-[#64748B] mb-3">
                    Headers are matched case-insensitively. Each row needs at least a <span className="font-medium">Title</span> and a <span className="font-medium">Module</span>.
                </p>
                <div className="flex flex-wrap gap-1.5">
                    {TEMPLATE_COLUMNS.map(col => (
                        <span key={col} className="px-2 py-0.5 rounded-md bg-[#F1F5F9] text-[11px] font-medium text-[#475569]">{col}</span>
                    ))}
                </div>
                <p className="text-[11px] text-[#94A3B8] mt-3">
                    Importing into project: <span className="font-semibold text-[#06B6D4]">{project}</span>
                </p>
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════ */
/* ═══ STRUCTURED ERROR PANEL ════════════════════════ */
/* ═══════════════════════════════════════════════════ */

function ErrorPanel({ error, onRetry }: { error: BugImportPreviewResponse; onRetry?: () => void }) {
    // Bug ID conflicts are warnings (409); structural failures are errors.
    const isConflict = error.errorType === 'BUG_ID_EXISTS' || error.errorType === 'DUPLICATE_BUG_ID';
    return (
        <Alert type={isConflict ? 'warning' : 'error'} title={error.error}>
            {error.existingBugIds && error.existingBugIds.length > 0 && (
                <ChipList
                    label="Bug ID(s) already exist in this project — change them and re-upload:"
                    items={error.existingBugIds}
                    dotColor="#F97316"
                />
            )}
            {error.duplicateBugIds && error.duplicateBugIds.length > 0 && (
                <ChipList
                    label="Duplicate Bug ID(s) within the file — each ID must be unique:"
                    items={error.duplicateBugIds}
                    dotColor="#F97316"
                />
            )}
            {error.missingColumns && error.missingColumns.length > 0 && (
                <ChipList
                    label="Missing required column(s):"
                    items={error.missingColumns}
                    dotColor="#EF4444"
                />
            )}
            {error.rowErrors && error.rowErrors.length > 0 && (
                <div className="mt-3">
                    <p className="text-xs font-medium text-[#475569] mb-1.5">
                        {error.rowErrors.length} row(s) failed validation:
                    </p>
                    <ul className="space-y-1 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                        {error.rowErrors.slice(0, 50).map((re, i) => (
                            <li key={i} className="text-xs text-[#64748B]">
                                <span className="font-mono text-[#EF4444]">row {re.row}</span>
                                {' — '}{re.message}
                            </li>
                        ))}
                        {error.rowErrors.length > 50 && (
                            <li className="text-[11px] text-[#94A3B8]">…and {error.rowErrors.length - 50} more.</li>
                        )}
                    </ul>
                </div>
            )}

            {onRetry && (
                <div className="mt-4">
                    <Button variant="primary" size="sm" onClick={onRetry} leftIcon={<Upload className="w-4 h-4" />}>
                        Try Again
                    </Button>
                </div>
            )}
        </Alert>
    );
}

function ChipList({ label, items, dotColor }: { label: string; items: string[]; dotColor: string }) {
    return (
        <div className="mt-3">
            <p className="text-xs font-medium text-[#475569] mb-1.5">{label}</p>
            <div className="flex flex-wrap gap-1.5">
                {items.map(m => (
                    <span key={m} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-[#E2E8F0] text-xs font-medium text-[#1E293B]">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: dotColor }} />
                        {m}
                    </span>
                ))}
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════ */
/* ═══ PREVIEW STEP ══════════════════════════════════ */
/* ═══════════════════════════════════════════════════ */

function PreviewStep({
    project, fileName, preview, saving, onCancel, onSave,
}: {
    project: string;
    fileName: string;
    preview: BugImportPreview | null;
    saving: boolean;
    onCancel: () => void;
    onSave: () => void;
}) {
    if (!preview) return null;

    return (
        <>
            {/* File summary */}
            <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 flex items-center gap-4 flex-wrap">
                <div className="w-11 h-11 rounded-xl bg-[#ECFEFF] flex items-center justify-center flex-shrink-0">
                    <FileSpreadsheet className="w-5 h-5 text-[#06B6D4]" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#1E293B] truncate">{fileName}</p>
                    <p className="text-xs text-[#64748B]">
                        Project: <span className="font-medium text-[#475569]">{project}</span>
                    </p>
                </div>
                <div className="text-center">
                    <p className="text-xl font-bold text-[#0F172A]">{preview.totalBugs}</p>
                    <p className="text-[11px] text-[#64748B] uppercase tracking-wider">Bugs</p>
                </div>
            </div>

            {/* Bug table */}
            <BugTable bugs={preview.bugs} />

            {/* Sticky action bar (mirrors test-case-import layout) */}
            <div className="fixed bottom-0 left-0 right-0 ml-[280px] z-30 bg-white/95 backdrop-blur border-t border-[#E2E8F0] px-6 py-3 flex items-center justify-between gap-4">
                <Button variant="ghost" size="md" onClick={onCancel} disabled={saving} leftIcon={<ArrowLeft className="w-4 h-4" />}>
                    Cancel
                </Button>
                <div className="flex items-center gap-3">
                    <p className="text-xs text-[#64748B] hidden sm:block">
                        Saving <span className="font-semibold text-[#1E293B]">{preview.totalBugs}</span> bug(s) into{' '}
                        <span className="font-semibold text-[#06B6D4]">{project}</span>
                    </p>
                    <Button variant="success" size="md" onClick={onSave} isLoading={saving} leftIcon={!saving ? <CheckCircle2 className="w-4 h-4" /> : undefined}>
                        {saving ? 'Saving…' : 'Save All Bugs'}
                    </Button>
                </div>
            </div>
        </>
    );
}

function BugTable({ bugs }: { bugs: BugImportRow[] }) {
    const [search, setSearch] = useState('');
    const filterKey = search;

    const filtered = useMemo(() => {
        if (!search) return bugs;
        const q = search.toLowerCase();
        return bugs.filter(b =>
            b.title.toLowerCase().includes(q) ||
            b.bugId.toLowerCase().includes(q) ||
            b.module.toLowerCase().includes(q) ||
            b.assignee.toLowerCase().includes(q)
        );
    }, [bugs, search]);

    const {
        page, pageSize, setPage, setPageSize,
        totalPages, totalItems, startIdx, endIdx,
        paginatedItems,
    } = usePagination(filtered, 10, filterKey);

    return (
        <div className="space-y-4">
            {/* Search */}
            <div className="bg-white rounded-2xl border border-[#E2E8F0] p-4">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search by Bug ID, title, module, assignee…"
                        className="w-full pl-9 pr-4 h-10 rounded-xl border border-[#E2E8F0] text-sm text-[#1E293B] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#06B6D4]/20 focus:border-[#06B6D4]"
                    />
                </div>
            </div>

            {/* Table — mirrors the Excel columns exactly (12 columns) */}
            <div className="bg-white rounded-2xl border border-[#E2E8F0] overflow-hidden">
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-sm min-w-[1200px]">
                        <thead>
                            <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-left">
                                <th className="px-4 py-3 font-semibold text-[#64748B] whitespace-nowrap">Bug ID</th>
                                <th className="px-4 py-3 font-semibold text-[#64748B] whitespace-nowrap">Module</th>
                                <th className="px-4 py-3 font-semibold text-[#64748B] whitespace-nowrap">Title / Summary</th>
                                <th className="px-4 py-3 font-semibold text-[#64748B] whitespace-nowrap">Severity</th>
                                <th className="px-4 py-3 font-semibold text-[#64748B] whitespace-nowrap">Priority</th>
                                <th className="px-4 py-3 font-semibold text-[#64748B] whitespace-nowrap">Description</th>
                                <th className="px-4 py-3 font-semibold text-[#64748B] whitespace-nowrap">Steps to Reproduce</th>
                                <th className="px-4 py-3 font-semibold text-[#64748B] whitespace-nowrap">Expected Result</th>
                                <th className="px-4 py-3 font-semibold text-[#64748B] whitespace-nowrap">Actual Result</th>
                                <th className="px-4 py-3 font-semibold text-[#64748B] whitespace-nowrap">Bug Impact Area</th>
                                <th className="px-4 py-3 font-semibold text-[#64748B] whitespace-nowrap">Status</th>
                                <th className="px-4 py-3 font-semibold text-[#64748B] whitespace-nowrap">Assigned To</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedItems.length === 0 ? (
                                <tr>
                                    <td colSpan={12} className="px-4 py-10 text-center text-sm text-[#94A3B8]">
                                        No bugs match “{search}”.
                                    </td>
                                </tr>
                            ) : paginatedItems.map((b, i) => {
                                const steps = b.stepsToReproduce.join(' / ');
                                return (
                                    <tr key={i} className="border-b border-[#F1F5F9] last:border-0 hover:bg-[#F8FAFC] align-top">
                                        <td className="px-4 py-3 font-mono text-xs text-[#475569] whitespace-nowrap">
                                            {b.bugId || <span className="text-[#94A3B8] italic">auto</span>}
                                        </td>
                                        <td className="px-4 py-3 text-[#1E293B] whitespace-nowrap">{b.module}</td>
                                        <td className="px-4 py-3 text-[#1E293B] max-w-[220px]"><p className="truncate" title={b.title}>{b.title}</p></td>
                                        <td className="px-4 py-3 whitespace-nowrap"><SeverityBadge severity={b.severity} /></td>
                                        <td className="px-4 py-3 whitespace-nowrap"><PriorityBadge priority={b.priority} /></td>
                                        <td className="px-4 py-3 text-[#1E293B] max-w-[220px]"><p className="truncate" title={b.description}>{b.description || '—'}</p></td>
                                        <td className="px-4 py-3 text-[#1E293B] max-w-[220px]"><p className="truncate" title={steps}>{steps || '—'}</p></td>
                                        <td className="px-4 py-3 text-[#1E293B] max-w-[200px]"><p className="truncate" title={b.expectedResult}>{b.expectedResult || '—'}</p></td>
                                        <td className="px-4 py-3 text-[#1E293B] max-w-[200px]"><p className="truncate" title={b.actualResult}>{b.actualResult || '—'}</p></td>
                                        <td className="px-4 py-3 text-[#1E293B] max-w-[160px]"><p className="truncate" title={b.impact}>{b.impact || '—'}</p></td>
                                        <td className="px-4 py-3 whitespace-nowrap"><StatusBadge status={b.status} /></td>
                                        <td className="px-4 py-3 text-[#475569] whitespace-nowrap">{b.assignee}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Pagination for large imports */}
            {filtered.length > 0 && (
                <Pagination
                    page={page}
                    totalPages={totalPages}
                    totalItems={totalItems}
                    startIdx={startIdx}
                    endIdx={endIdx}
                    pageSize={pageSize}
                    onPageChange={setPage}
                    onPageSizeChange={setPageSize}
                />
            )}
        </div>
    );
}

/* ═══════════════════════════════════════════════════ */
/* ═══ SUCCESS STEP ══════════════════════════════════ */
/* ═══════════════════════════════════════════════════ */

function SuccessStep({
    project, savedCount, onImportAnother, onViewBugs,
}: {
    project: string;
    savedCount: number;
    onImportAnother: () => void;
    onViewBugs: () => void;
}) {
    return (
        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-10 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-[#F0FDF4] flex items-center justify-center mb-4">
                <CheckCircle2 className="w-8 h-8 text-[#22C55E]" />
            </div>
            <h2 className="text-lg font-bold text-[#0F172A]">Import complete</h2>
            <p className="text-sm text-[#64748B] mt-1 max-w-md">
                <span className="font-semibold text-[#1E293B]">{savedCount}</span> bug(s) were saved into{' '}
                <span className="font-semibold text-[#06B6D4]">{project}</span>. The dashboard has been updated.
            </p>
            <div className="flex items-center gap-3 mt-6">
                <Button variant="secondary" size="md" onClick={onImportAnother} leftIcon={<Upload className="w-4 h-4" />}>
                    Import Another File
                </Button>
                <Button variant="primary" size="md" onClick={onViewBugs} leftIcon={<FileCheck2 className="w-4 h-4" />}>
                    View Bug Dashboard
                </Button>
            </div>
        </div>
    );
}
