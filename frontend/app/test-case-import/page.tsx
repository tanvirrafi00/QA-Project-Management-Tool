'use client';

/**
 * Test Case Import Page
 *
 * Multi-sheet XLSX import where each sheet = one module.
 * Flow: Upload (drag & drop) → backend parse + validate → module-wise preview → Save.
 *
 * Data path (docs/api-standards.md §9):
 *   page → testCaseService.importTestCases() → fetch('/api/test-cases/import') [dedicated Route Handler]
 *        → backend multer + xlsx parse + validate → preview JSON.
 *   Save → testCaseService.saveImportedTestCases() → /api/test-cases/import/save [catch-all] → repository.
 */

import { useState, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell, PageContainer } from '@/components/layout';
import { Button } from '@/components/core';
import { Pagination, usePagination } from '@/components/ui/Pagination';
import { AdvancedTestCaseTable } from '@/features/test-case-generator/components/AdvancedTestCaseTable';
import { useModuleProject } from '@/features/project-management/hooks/useModuleProject';
import { ModuleProjectSelector } from '@/features/project-management/components/ModuleProjectSelector';
import { useToast } from '@/components/ui/Toast';
import { Alert } from '@/components/ui/Alert';
import { testCaseService } from '@/features/test-case-management/services/test-case.service';
import type { ImportPreviewResponse } from '@/features/test-case-management/services/test-case.service';
import type {
    ImportPreview,
    ImportedModule,
} from '@/features/test-case-management/types';
import * as XLSX from 'xlsx';
import {
    Upload, FileSpreadsheet, CheckCircle2, X, Loader2,
    Search, Download, ArrowLeft, Layers, FileCheck2, ClipboardList,
} from 'lucide-react';

type Stage = 'upload' | 'preview' | 'saving' | 'success';

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export default function TestCaseImportPage() {
    const router = useRouter();
    const { projects, selectedProjectName, setSelectedProject, loading: projectsLoading } = useModuleProject('test-case-import');
    const project = selectedProjectName;
    const toast = useToast();

    const [stage, setStage] = useState<Stage>('upload');
    const [isDragging, setIsDragging] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [fileName, setFileName] = useState<string>('');
    const [preview, setPreview] = useState<ImportPreview | null>(null);
    const [error, setError] = useState<ImportPreviewResponse | null>(null);
    const [savedCount, setSavedCount] = useState(0);
    const [savedModules, setSavedModules] = useState(0);
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
            setError({
                success: false,
                error: 'Invalid file format. Please upload an .xlsx file only.',
                errorType: 'INVALID_FILE',
            });
            return;
        }
        if (file.size > MAX_SIZE_BYTES) {
            setError({
                success: false,
                error: 'File too large. Maximum allowed size is 10 MB.',
                errorType: 'INVALID_FILE',
            });
            return;
        }

        setUploading(true);
        const res = await testCaseService.importTestCases(file, project);
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
        const res = await testCaseService.saveImportedTestCases({
            projectName: project,
            modules: preview.modules,
        });
        if (res.success && res.data) {
            setSavedCount(res.data.total);
            setSavedModules(res.data.modulesCreated);
            setStage('success');
        } else {
            toast.error(res.error || 'Failed to save the import. Please try again.');
            setStage('preview');
        }
    };

    const handleDownloadTemplate = () => {
        const headers = [
            'Module', 'TC ID', 'TC Name', 'Priority', 'Test Steps', 'Expected Results',
            'Test Status', 'Actual Result', 'Assigned To', 'Execution Date', 'Related Bugs', 'Comments',
        ];
        const example = [
            'Login Module', 'TC-001', 'Successful login with valid credentials', 'High',
            'Open login page\nEnter valid email\nEnter valid password\nClick Sign In',
            'User is redirected to the dashboard', 'Not Executed', '', 'QA Tester', '', '', '',
        ];
        const ws = XLSX.utils.aoa_to_sheet([headers, example]);
        ws['!cols'] = headers.map(() => ({ wch: 18 }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Login Module');
        XLSX.writeFile(wb, 'test-case-import-template.xlsx');
    };

    return (
        <AppShell>
            <PageContainer>
                <div className="space-y-6 pb-28">
                    {/* Header */}
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div>
                            <h1 className="text-2xl font-bold text-[#0F172A] tracking-tight">Import Test Cases</h1>
                            <p className="text-sm text-[#64748B] mt-1">
                                Upload a multi-sheet Excel file — each sheet becomes a module of test cases.
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
                            savedModules={savedModules}
                            onImportAnother={reset}
                            onViewTestCases={() => router.push('/test-management')}
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
    error: ImportPreviewResponse | null;
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
                                <Layers className="w-3.5 h-3.5" /> Each sheet = Module
                            </span>
                        </div>
                    </>
                )}
            </div>

            {/* Format help */}
            <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5">
                <h3 className="text-sm font-semibold text-[#1E293B] mb-2">Required columns per sheet</h3>
                <p className="text-xs text-[#64748B] mb-3">
                    The sheet name becomes the module name. Each row needs a TC Name, Test Steps, and Expected Results.
                </p>
                <div className="flex flex-wrap gap-1.5">
                    {['Module', 'TC ID', 'TC Name', 'Priority', 'Test Steps', 'Expected Results', 'Test Status', 'Actual Result', 'Assigned To', 'Execution Date', 'Related Bugs', 'Comments'].map(col => (
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

function ErrorPanel({ error, onRetry }: { error: ImportPreviewResponse; onRetry?: () => void }) {
    // Conflicts (existing/duplicate modules) are warnings; structural failures are errors.
    // Both render through the global Alert shell so the import errors match the rest of the app.
    const isConflict = error.errorType === 'MODULE_EXISTS' || error.errorType === 'DUPLICATE_MODULE';
    return (
        <Alert type={isConflict ? 'warning' : 'error'} title={error.error}>
            {error.conflictingModules && error.conflictingModules.length > 0 && (
                <ModuleList
                    label="Existing module(s) detected — please remove these sheets and re-upload:"
                    items={error.conflictingModules}
                    dotColor="#F97316"
                />
            )}
            {error.duplicateModules && error.duplicateModules.length > 0 && (
                <ModuleList
                    label="Duplicate module name(s) across sheets — each sheet must be unique:"
                    items={error.duplicateModules}
                    dotColor="#F97316"
                />
            )}
            {error.missingColumns && error.missingColumns.length > 0 && (
                <ModuleList
                    label="Missing required column(s):"
                    items={error.missingColumns}
                    dotColor="#EF4444"
                />
            )}
            {error.emptySheets && error.emptySheets.length > 0 && (
                <ModuleList
                    label="Empty module sheet(s) — every sheet needs at least one test case:"
                    items={error.emptySheets}
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
                                <span className="font-mono text-[#EF4444]">{re.sheet} · row {re.row}</span>
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

function ModuleList({ label, items, dotColor }: { label: string; items: string[]; dotColor: string }) {
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
    preview: ImportPreview | null;
    saving: boolean;
    onCancel: () => void;
    onSave: () => void;
}) {
    const [activeModule, setActiveModule] = useState(0);

    if (!preview) return null;
    const modules = preview.modules;
    const safeActive = Math.min(activeModule, modules.length - 1);
    const current = modules[safeActive];

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
                <div className="flex items-center gap-5">
                    <div className="text-center">
                        <p className="text-xl font-bold text-[#0F172A]">{preview.modulesCount}</p>
                        <p className="text-[11px] text-[#64748B] uppercase tracking-wider">Modules</p>
                    </div>
                    <div className="w-px h-8 bg-[#E2E8F0]" />
                    <div className="text-center">
                        <p className="text-xl font-bold text-[#0F172A]">{preview.totalCases}</p>
                        <p className="text-[11px] text-[#64748B] uppercase tracking-wider">Test Cases</p>
                    </div>
                </div>
            </div>

            {/* Module tabs */}
            <div className="flex items-center gap-1 bg-[#F1F5F9] rounded-xl p-1 w-fit max-w-full overflow-x-auto custom-scrollbar">
                {modules.map((m, i) => (
                    <button
                        key={m.module}
                        onClick={() => setActiveModule(i)}
                        className={`flex items-center gap-2 px-4 h-9 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${i === safeActive ? 'bg-white text-[#0F172A] shadow-sm' : 'text-[#64748B] hover:text-[#1E293B]'
                            }`}
                    >
                        <Layers className="w-3.5 h-3.5" />
                        {m.module}
                        <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${i === safeActive ? 'bg-[#06B6D4]/10 text-[#06B6D4]' : 'bg-[#E2E8F0] text-[#64748B]'}`}>
                            {m.testCases.length}
                        </span>
                    </button>
                ))}
            </div>

            {/* Active module table */}
            {current && <ModuleTable module={current} />}

            {/* Sticky action bar */}
            <div className="fixed bottom-0 left-0 right-0 ml-[280px] z-30 bg-white/95 backdrop-blur border-t border-[#E2E8F0] px-6 py-3 flex items-center justify-between gap-4">
                <Button variant="ghost" size="md" onClick={onCancel} disabled={saving} leftIcon={<ArrowLeft className="w-4 h-4" />}>
                    Cancel
                </Button>
                <div className="flex items-center gap-3">
                    <p className="text-xs text-[#64748B] hidden sm:block">
                        Saving <span className="font-semibold text-[#1E293B]">{preview.totalCases}</span> test cases across{' '}
                        <span className="font-semibold text-[#1E293B]">{preview.modulesCount}</span> module(s) into{' '}
                        <span className="font-semibold text-[#06B6D4]">{project}</span>
                    </p>
                    <Button variant="success" size="md" onClick={onSave} isLoading={saving} leftIcon={!saving ? <CheckCircle2 className="w-4 h-4" /> : undefined}>
                        {saving ? 'Saving…' : 'Save All Test Cases'}
                    </Button>
                </div>
            </div>
        </>
    );
}

function ModuleTable({ module }: { module: ImportedModule }) {
    const [search, setSearch] = useState('');
    const filterKey = search;

    const filtered = useMemo(() => {
        if (!search) return module.testCases;
        const q = search.toLowerCase();
        return module.testCases.filter(tc =>
            tc.name.toLowerCase().includes(q) ||
            tc.tcId.toLowerCase().includes(q) ||
            tc.expectedResult.toLowerCase().includes(q)
        );
    }, [module.testCases, search]);

    const {
        page, pageSize, setPage, setPageSize,
        totalPages, totalItems, startIdx, endIdx,
        paginatedItems,
    } = usePagination(filtered, 10, filterKey);

    // Map rows onto the shared 12-column table shape; inject the module name so the Module column
    // is populated (the sheet name is the module for every row in this tab).
    const rows = paginatedItems.map(tc => ({ ...tc, module: module.module }));

    return (
        <div className="space-y-4">
            {/* Search within module */}
            <div className="bg-white rounded-2xl border border-[#E2E8F0] p-4">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder={`Search within ${module.module}…`}
                        className="w-full pl-9 pr-4 h-10 rounded-xl border border-[#E2E8F0] text-sm text-[#1E293B] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#06B6D4]/20 focus:border-[#06B6D4]"
                    />
                </div>
            </div>

            {/* Shared 12-column table — identical columns/layout to Test Management */}
            <AdvancedTestCaseTable
                testCases={rows}
                emptyMessage={`No test cases match “${search}”.`}
            />

            {/* Pagination for large sheets */}
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
    project, savedCount, savedModules, onImportAnother, onViewTestCases,
}: {
    project: string;
    savedCount: number;
    savedModules: number;
    onImportAnother: () => void;
    onViewTestCases: () => void;
}) {
    return (
        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-10 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-[#F0FDF4] flex items-center justify-center mb-4">
                <CheckCircle2 className="w-8 h-8 text-[#22C55E]" />
            </div>
            <h2 className="text-lg font-bold text-[#0F172A]">Import complete</h2>
            <p className="text-sm text-[#64748B] mt-1 max-w-md">
                <span className="font-semibold text-[#1E293B]">{savedCount}</span> test case(s) across{' '}
                <span className="font-semibold text-[#1E293B]">{savedModules}</span> module(s) were saved into{' '}
                <span className="font-semibold text-[#06B6D4]">{project}</span>.
            </p>
            <div className="flex items-center gap-3 mt-6">
                <Button variant="secondary" size="md" onClick={onImportAnother} leftIcon={<Upload className="w-4 h-4" />}>
                    Import Another File
                </Button>
                <Button variant="primary" size="md" onClick={onViewTestCases} leftIcon={<FileCheck2 className="w-4 h-4" />}>
                    View Test Cases
                </Button>
            </div>
        </div>
    );
}

