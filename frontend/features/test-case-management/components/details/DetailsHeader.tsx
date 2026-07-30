'use client';

/**
 * DetailsHeader — sticky top header.
 *
 * Left: Back · tcId · name (H1) · priority/type badges. Right: prev/next, a quick-status
 * `CustomSelect` (one-click Execute), Edit + Execute buttons, and a "More" overflow menu
 * (Assign · Duplicate · Export · Delete). Stays visible while scrolling.
 */
import { useEffect, useState } from 'react';
import {
    ArrowLeft, ChevronLeft, ChevronRight, Pencil, MoreHorizontal,
    UserPlus, Copy, Download, Trash2,
} from 'lucide-react';
import { Button } from '@/components/core';
import { CustomSelect } from '@/components/ui/CustomSelect';
import type { TestCase, TestCaseStatus } from '@/features/test-case-management/types';
import { PriorityTag, StatusPill } from './shared/Badges';
import { STATUS_OPTIONS, STATUS_COLOR, titleCase } from './shared/constants';

interface DetailsHeaderProps {
    tc: TestCase;
    hasPrev: boolean;
    hasNext: boolean;
    onBack: () => void;
    onPrev: () => void;
    onNext: () => void;
    onEdit: () => void;
    onAssign: () => void;
    onDuplicate: () => void;
    onExport: () => void;
    onDelete: () => void;
    onQuickStatus: (status: TestCaseStatus) => void;
}

export function DetailsHeader({
    tc, hasPrev, hasNext, onBack, onPrev, onNext, onEdit,
    onAssign, onDuplicate, onExport, onDelete, onQuickStatus,
}: DetailsHeaderProps) {
    const [menuOpen, setMenuOpen] = useState(false);

    // Close the overflow menu on Escape (the global handler ignores keys while a menu is open).
    useEffect(() => {
        if (!menuOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setMenuOpen(false);
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [menuOpen]);

    return (
        <div className="sticky top-0 z-30 -mx-8 px-8 py-4 bg-white/90 backdrop-blur border-b border-[#E2E8F0]">
            {/* Back */}
            <button
                onClick={onBack}
                className="inline-flex items-center gap-1.5 text-sm text-[#64748B] hover:text-[#06B6D4] transition-colors mb-2"
            >
                <ArrowLeft className="w-4 h-4" />
                Back to Test Cases
            </button>

            <div className="flex items-start justify-between gap-4 flex-wrap">
                {/* Identity */}
                <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <span className="text-xs font-mono font-semibold text-[#06B6D4] px-2 py-0.5 rounded-md bg-[#ECFEFF]">
                            {tc.tcId}
                        </span>
                        <PriorityTag priority={tc.priority} />
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-[#F5F3FF] text-[#8B5CF6]">
                            {titleCase(tc.type)}
                        </span>
                    </div>
                    <h1 className="text-2xl font-bold text-[#0F172A] tracking-tight leading-tight break-words">
                        {tc.name}
                    </h1>
                    <div className="mt-2">
                        <StatusPill status={tc.testStatus} size="md" />
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-wrap justify-end">
                    {/* Prev / Next */}
                    <div className="flex items-center gap-1 mr-1">
                        <button
                            onClick={onPrev}
                            disabled={!hasPrev}
                            title="Previous test case (Alt+←)"
                            className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-[#64748B] hover:text-[#06B6D4] hover:bg-[#ECFEFF] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <button
                            onClick={onNext}
                            disabled={!hasNext}
                            title="Next test case (Alt+→)"
                            className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-[#64748B] hover:text-[#06B6D4] hover:bg-[#ECFEFF] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <ChevronRight className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Quick status (one-click Execute) */}
                    <div style={{ width: '168px' }} title="Quick status update">
                        <CustomSelect
                            options={STATUS_OPTIONS.map((s) => ({
                                value: s,
                                label: s,
                                icon: (
                                    <span
                                        style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLOR[s], flexShrink: 0 }}
                                    />
                                ),
                            }))}
                            value={tc.testStatus}
                            onChange={(v) => onQuickStatus(v as TestCaseStatus)}
                            height={38}
                            accentColor={STATUS_COLOR[tc.testStatus]}
                        />
                    </div>

                    <Button variant="secondary" size="sm" onClick={onEdit} leftIcon={<Pencil className="w-4 h-4" />} title="Edit (Ctrl/⌘+E)">
                        Edit
                    </Button>

                    {/* More (overflow) */}
                    <div className="relative">
                        <button
                            onClick={() => setMenuOpen((o) => !o)}
                            aria-label="More actions"
                            className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-[#64748B] hover:text-[#1E293B] hover:bg-[#F1F5F9] transition-colors"
                        >
                            <MoreHorizontal className="w-5 h-5" />
                        </button>
                        {menuOpen && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                                <div className="absolute right-0 top-11 z-50 w-52 bg-white rounded-xl border border-[#E2E8F0] shadow-xl py-1.5">
                                    <MenuItem icon={<UserPlus className="w-4 h-4" />} label="Assign" onClick={() => { setMenuOpen(false); onAssign(); }} />
                                    <MenuItem icon={<Copy className="w-4 h-4" />} label="Duplicate" hint="Ctrl/⌘+D" onClick={() => { setMenuOpen(false); onDuplicate(); }} />
                                    <MenuItem icon={<Download className="w-4 h-4" />} label="Export (.xlsx)" onClick={() => { setMenuOpen(false); onExport(); }} />
                                    <div className="my-1 h-px bg-[#F1F5F9]" />
                                    <MenuItem icon={<Trash2 className="w-4 h-4" />} label="Delete" danger onClick={() => { setMenuOpen(false); onDelete(); }} />
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function MenuItem({
    icon, label, hint, onClick, danger,
}: {
    icon: React.ReactNode;
    label: string;
    hint?: string;
    onClick: () => void;
    danger?: boolean;
}) {
    return (
        <button
            onClick={onClick}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                danger ? 'text-[#DC2626] hover:bg-[#FEF2F2]' : 'text-[#1E293B] hover:bg-[#F8FAFC]'
            }`}
        >
            <span className={danger ? 'text-[#DC2626]' : 'text-[#64748B]'}>{icon}</span>
            <span className="flex-1 text-left">{label}</span>
            {hint && <span className="text-[10px] text-[#94A3B8] font-mono">{hint}</span>}
        </button>
    );
}
