'use client';

/**
 * BugDetailsView — composition root for the Bug Details page (replaces the former BugDetailDrawer).
 *
 * Renders a sticky header (back / prev / next / edit / export / delete), summary cards, the left
 * section-nav + a section stack, an edit modal, and a delete confirm. Owns the keyboard-shortcut
 * listener. No data fetching lives here — the route `page.tsx` passes the bug + history + project
 * list (mirrors the test-case details pattern).
 */
import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
    ArrowLeft, ChevronLeft, ChevronRight, Pencil, Download, Trash2, Bug as BugIcon,
    Info, FileText, ClipboardList, Check, AlertTriangle, Paperclip, History, Link2,
    Sparkles, Search, Wrench, Tag, Clock, Activity, type LucideIcon,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/core';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { bugService } from '../../services/bug.service';
import type { Bug, BugHistoryEntry } from '../../types';
import { SeverityBadge, StatusBadge, PriorityBadge } from '../BugBadges';
import { BugDetailsSectionNav } from './BugDetailsSectionNav';
import { BugEditModal } from './BugEditModal';

const EXPORT_COLUMNS = [
    'Bug ID', 'Module', 'Title / Summary', 'Severity', 'Priority', 'Description',
    'Steps to Reproduce', 'Expected Result', 'Actual Result',
    'Bug Impact Area', 'Status', 'Assigned To',
];

interface Props {
    bug: Bug;
    history: BugHistoryEntry[];
    projectBugs: Bug[];
    onReload: () => void;
    onDeleted: () => void;
}

export function BugDetailsView({ bug, history, projectBugs, onReload, onDeleted }: Props) {
    const router = useRouter();
    const toast = useToast();

    const [showEdit, setShowEdit] = useState(false);
    const [showDelete, setShowDelete] = useState(false);
    const [deleting, setDeleting] = useState(false);

    // Prev/Next over the full project list (position-stable across the project).
    const index = projectBugs.findIndex((b) => b.id === bug.id);
    const prevId = index > 0 ? projectBugs[index - 1].id : null;
    const nextId = index >= 0 && index < projectBugs.length - 1 ? projectBugs[index + 1].id : null;
    const detailsPath = (id: string) => `/bugs/${id}`;

    const handleBack = () => {
        if (typeof window !== 'undefined' && window.history.length <= 1) {
            router.push('/bug-dashboard');
        } else {
            router.back();
        }
    };

    const handleExport = () => {
        try {
            const row = [
                bug.bugId, bug.module, bug.title, bug.severity, bug.priority, bug.description,
                bug.stepsToReproduce.join('\n'), bug.expectedResult, bug.actualResult,
                bug.impact, bug.status, bug.assignee,
            ];
            const ws = XLSX.utils.aoa_to_sheet([EXPORT_COLUMNS, row]);
            ws['!cols'] = EXPORT_COLUMNS.map(() => ({ wch: 20 }));
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Bug');
            XLSX.writeFile(wb, `${bug.bugId || 'bug'}.xlsx`);
            toast.success('Exported bug.');
        } catch {
            toast.error('Failed to export bug.');
        }
    };

    const handleDelete = async () => {
        setDeleting(true);
        const result = await bugService.deleteBug(bug.id);
        setDeleting(false);
        if (result.success) {
            toast.success('Bug deleted.');
            setShowDelete(false);
            onDeleted();
        } else {
            toast.error(result.error || 'Failed to delete bug.');
        }
    };

    // Keyboard shortcuts: Esc→Back, Ctrl/⌘+E→Edit, Alt+←/→→prev/next.
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
    }, [showEdit, showDelete, prevId, nextId, bug.id]);

    return (
        <>
            {/* ── Sticky action bar: navigation + actions ── */}
            <div className="sticky top-0 z-20 -mx-4 px-4 sm:-mx-6 sm:px-6 py-2.5 bg-[#F9FAFB]/90 backdrop-blur border-b border-[#E2E8F0] mb-6">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5">
                        <button onClick={handleBack} title="Back (Esc)" className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-[#E2E8F0] bg-white text-[13px] font-medium text-[#475569] hover:bg-[#F8FAFC] transition-colors">
                            <ArrowLeft className="w-4 h-4" /> Back
                        </button>
                        <span className="w-px h-6 bg-[#E2E8F0] mx-0.5" />
                        <button onClick={() => prevId && router.push(detailsPath(prevId))} disabled={!prevId} title="Previous bug (Alt+←)" className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-[#E2E8F0] bg-white text-[#475569] hover:bg-[#F8FAFC] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button onClick={() => nextId && router.push(detailsPath(nextId))} disabled={!nextId} title="Next bug (Alt+→)" className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-[#E2E8F0] bg-white text-[#475569] hover:bg-[#F8FAFC] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="secondary" size="sm" onClick={() => setShowEdit(true)} leftIcon={<Pencil className="w-4 h-4" />}>Edit</Button>
                        <Button variant="secondary" size="sm" onClick={handleExport} leftIcon={<Download className="w-4 h-4" />}>Export</Button>
                        <Button variant="danger" size="sm" onClick={() => setShowDelete(true)} leftIcon={<Trash2 className="w-4 h-4" />}>Delete</Button>
                    </div>
                </div>
            </div>

            {/* ── Title + classification ── */}
            <div className="mb-6">
                <div className="flex items-center gap-2 text-xs text-[#64748B]">
                    <BugIcon className="w-3.5 h-3.5 text-[#06B6D4]" />
                    <span className="font-mono font-medium">{bug.bugId}</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#F1F5F9] text-[#64748B]">v{bug.version}</span>
                    <span className="text-[#CBD5E1]">·</span>
                    <span className="truncate">{bug.projectName}</span>
                </div>
                <h1 className="text-2xl font-bold text-[#0F172A] tracking-tight leading-snug mt-1.5">{bug.title}</h1>
                <div className="flex items-center gap-2 flex-wrap mt-3">
                    <SeverityBadge severity={bug.severity} />
                    <PriorityBadge priority={bug.priority} />
                    <StatusBadge status={bug.status} />
                </div>
            </div>

            {/* ── Summary cards: metadata (classification lives in the header badges) ── */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
                <SummaryCard label="Module" value={bug.module} />
                <SummaryCard label="Layer" value={bug.layer} />
                <SummaryCard label="Assignee" value={bug.assignee} />
                <SummaryCard label="Reporter" value={bug.reporter} />
                <SummaryCard label="Environment" value={bug.environment} />
                <SummaryCard label="Last Updated" value={new Date(bug.updatedAt).toLocaleDateString()} />
            </div>

            {/* ── Nav + sections ── */}
            <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-6 items-start">
                <BugDetailsSectionNav />
                <div className="space-y-6 min-w-0">
                    {/* Overview */}
                    <SectionCard id="overview" title="Overview" icon={Info}>
                        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
                            <Field label="Project" value={bug.projectName} />
                            <Field label="Module" value={bug.module} />
                            <Field label="Layer" value={bug.layer} />
                            <Field label="Environment" value={bug.environment} />
                            <Field label="Reporter" value={bug.reporter} />
                            <Field label="Assignee" value={bug.assignee} />
                            <Field label="Created" value={new Date(bug.createdAt).toLocaleString()} />
                            <Field label="Last Updated" value={new Date(bug.updatedAt).toLocaleString()} />
                            {bug.aiConfidence !== undefined && bug.aiConfidence !== null && (
                                <Field label="AI Confidence" value={`${bug.aiConfidence}%`} />
                            )}
                        </dl>
                    </SectionCard>

                    {/* Description */}
                    <SectionCard id="description" title="Description" icon={FileText}>
                        <p className="text-sm text-[#1E293B] leading-relaxed whitespace-pre-wrap">
                            {bug.description || <span className="text-[#94A3B8]">No description provided.</span>}
                        </p>
                    </SectionCard>

                    {/* Reproduction */}
                    <SectionCard id="reproduction" title="Reproduction" icon={ClipboardList}>
                        {bug.precondition && (
                            <div className="mb-4">
                                <h4 className="text-xs font-bold text-[#64748B] uppercase tracking-wider mb-2">Preconditions</h4>
                                <p className="text-sm text-[#1E293B] leading-relaxed">{bug.precondition}</p>
                            </div>
                        )}
                        {bug.currentBehavior && bug.currentBehavior.length > 0 && (
                            <div className="mb-4">
                                <h4 className="flex items-center gap-1.5 text-xs font-bold text-[#64748B] uppercase tracking-wider mb-2"><Activity className="w-3.5 h-3.5" /> Current Behavior</h4>
                                <ul className="space-y-1.5">
                                    {bug.currentBehavior.map((item, i) => {
                                        const fail = item.includes('❌');
                                        const pass = item.includes('✔️') || item.includes('✅');
                                        return <li key={i} className={`text-sm flex items-start gap-2 ${fail ? 'text-[#DC2626]' : pass ? 'text-[#16A34A]' : 'text-[#1E293B]'}`}>
                                            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-current flex-shrink-0" />
                                            {item.replace(/^[✔️❌✅✗]\s*/, '').trim()}
                                        </li>;
                                    })}
                                </ul>
                            </div>
                        )}
                        <h4 className="text-xs font-bold text-[#64748B] uppercase tracking-wider mb-2">Steps to Reproduce</h4>
                        {bug.stepsToReproduce.length > 0 ? (
                            <ol className="space-y-2">
                                {bug.stepsToReproduce.map((step, i) => (
                                    <li key={i} className="flex items-start gap-3">
                                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#0F172A] text-white flex items-center justify-center text-xs font-bold">{i + 1}</span>
                                        <span className="text-sm text-[#1E293B] leading-relaxed pt-0.5">{step}</span>
                                    </li>
                                ))}
                            </ol>
                        ) : <p className="text-sm text-[#94A3B8]">No steps recorded.</p>}
                    </SectionCard>

                    {/* Expected Result */}
                    <SectionCard id="expected" title="Expected Result" icon={Check}>
                        <p className="text-sm text-[#1E293B] leading-relaxed">{bug.expectedResult || <span className="text-[#94A3B8]">Not specified.</span>}</p>
                    </SectionCard>

                    {/* Actual Result */}
                    <SectionCard id="actual" title="Actual Result" icon={AlertTriangle}>
                        <p className="text-sm text-[#1E293B] leading-relaxed">{bug.actualResult || <span className="text-[#94A3B8]">Not specified.</span>}</p>
                    </SectionCard>

                    {/* Impact */}
                    <SectionCard id="impact" title="Bug Impact Area" icon={AlertTriangle}>
                        <p className="text-sm text-[#1E293B] leading-relaxed">{bug.impact || <span className="text-[#94A3B8]">Not specified.</span>}</p>
                        {bug.tags && bug.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-3">
                                {bug.tags.map((t, i) => (
                                    <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-[#F0FDFA] text-[#0F766E] border border-[#06B6D4]/20"><Tag className="w-3 h-3" />{t}</span>
                                ))}
                            </div>
                        )}
                    </SectionCard>

                    {/* Attachments — placeholder (future) */}
                    <SectionCard id="attachments" title="Attachments" icon={Paperclip}>
                        <p className="text-sm text-[#94A3B8]">Attachments (screenshots, videos, logs, API responses) are coming soon.</p>
                    </SectionCard>

                    {/* History */}
                    <SectionCard id="history" title={`History (${history.length})`} icon={History}>
                        {history.length === 0 ? (
                            <p className="text-sm text-[#94A3B8]">No edits recorded yet.</p>
                        ) : (
                            <ul className="space-y-3">
                                {history.slice().reverse().map((entry) => (
                                    <li key={entry.id} className="flex items-start gap-2.5">
                                        <Clock className="w-3.5 h-3.5 text-[#94A3B8] flex-shrink-0 mt-0.5" />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-medium text-[#1E293B]">{entry.changedField}</span>
                                                <span className="text-[10px] text-[#94A3B8]">by {entry.changedBy}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                <span className="text-[10px] text-[#94A3B8] line-through">{entry.oldValue.substring(0, 40)}</span>
                                                <span className="text-[10px] text-[#64748B]">→</span>
                                                <span className="text-[10px] font-medium text-[#22C55E]">{entry.newValue.substring(0, 40)}</span>
                                            </div>
                                            <span className="text-[10px] text-[#CBD5E1]">{new Date(entry.changedAt).toLocaleString()}</span>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </SectionCard>

                    {/* Linked Test Cases — placeholder (future) */}
                    <SectionCard id="linked-tests" title="Linked Test Cases" icon={Link2}>
                        <p className="text-sm text-[#94A3B8]">Bug ↔ test-case linking is coming soon.</p>
                    </SectionCard>

                    {/* AI Insights */}
                    <SectionCard id="ai-insights" title="AI Insights" icon={Sparkles}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="rounded-xl p-4 bg-[#FFFBEB] border border-[#F59E0B]/30">
                                <h4 className="flex items-center gap-1.5 text-xs font-bold text-[#92400E] uppercase tracking-wider mb-2"><Search className="w-3.5 h-3.5" /> Possible Root Cause</h4>
                                <p className="text-sm text-[#1E293B] leading-relaxed">{bug.possibleRootCause || <span className="text-[#94A3B8]">Not available.</span>}</p>
                            </div>
                            <div className="rounded-xl p-4 bg-[#EFF6FF] border border-[#3B82F6]/30">
                                <h4 className="flex items-center gap-1.5 text-xs font-bold text-[#1E40AF] uppercase tracking-wider mb-2"><Wrench className="w-3.5 h-3.5" /> Suggested Fix</h4>
                                <p className="text-sm text-[#1E293B] leading-relaxed">{bug.suggestedFix || <span className="text-[#94A3B8]">Not available.</span>}</p>
                            </div>
                        </div>
                        {bug.similarBugs && bug.similarBugs.length > 0 && (
                            <div className="mt-3">
                                <h4 className="text-xs font-bold text-[#64748B] uppercase tracking-wider mb-2">Similar Bugs</h4>
                                <div className="flex flex-wrap gap-1.5">
                                    {bug.similarBugs.map((b) => (
                                        <span key={b} className="px-2 py-0.5 rounded-md text-xs font-mono font-medium bg-white text-[#3B82F6] border border-[#3B82F6]/20">{b}</span>
                                    ))}
                                </div>
                            </div>
                        )}
                        {bug.missingInfo && bug.missingInfo.length > 0 && (
                            <div className="mt-3">
                                <h4 className="text-xs font-bold text-[#EF4444] uppercase tracking-wider mb-2">Missing Info</h4>
                                <ul className="space-y-1">
                                    {bug.missingInfo.map((info, i) => (
                                        <li key={i} className="text-xs text-[#64748B] flex items-start gap-1.5"><span className="text-[#EF4444] mt-0.5">•</span>{info}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </SectionCard>
                </div>
            </div>

            {showEdit && (
                <BugEditModal
                    bug={bug}
                    onClose={() => setShowEdit(false)}
                    onSaved={() => { setShowEdit(false); onReload(); }}
                />
            )}

            {showDelete && (
                <ConfirmDialog
                    title="Delete Bug"
                    entity={bug.bugId}
                    message={`Permanently delete "${bug.title}"? This action cannot be undone.`}
                    confirmLabel="Delete"
                    loading={deleting}
                    onConfirm={handleDelete}
                    onClose={() => !deleting && setShowDelete(false)}
                />
            )}
        </>
    );
}

/* ── Small building blocks ── */

function SummaryCard({ label, value }: { label: string; value: string }) {
    return (
        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-4">
            <p className="text-[11px] text-[#94A3B8] uppercase tracking-wider">{label}</p>
            <p className="text-sm font-semibold text-[#0F172A] mt-1 truncate" title={value}>{value || '—'}</p>
        </div>
    );
}

function Field({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between gap-3">
            <dt className="text-xs text-[#94A3B8]">{label}</dt>
            <dd className="text-xs font-medium text-[#1E293B] truncate" title={value}>{value || '—'}</dd>
        </div>
    );
}

function SectionCard({ id, title, icon: Icon, children }: { id: string; title: string; icon: LucideIcon; children: ReactNode }) {
    return (
        <section id={id} className="scroll-mt-[140px] bg-white rounded-2xl border border-[#E2E8F0] p-6">
            <h3 className="flex items-center gap-2 text-sm font-bold text-[#0F172A] mb-4">
                <Icon className="w-4 h-4 text-[#06B6D4]" />
                {title}
            </h3>
            {children}
        </section>
    );
}
