'use client';

/**
 * ApproveUserModal — admin approval form. Shows the requested role + registration date, defaults the
 * role selector to the requested role (admin may change it), collects optional project assignments
 * and notes, then submits via the page's `onConfirm`. Built on the shared `Modal` shell. Role options
 * come from the system config (passed in by the page from GET /api/auth/roles) — never hardcoded.
 */

import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Button, TextArea, Label } from '@/components/core';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { Modal } from '@/components/ui/Modal';
import type { Project } from '@/features/project-management/types';
import { roleLabel } from './UserStatusBadge';
import type { ApproveUserInput, UserAccount } from '../types';

export interface RoleOption {
    value: string;
    label: string;
}

export interface ApproveUserModalProps {
    user: UserAccount;
    projects: Project[];
    /** Requestable roles from GET /api/auth/roles (single source — no hardcoded role list). */
    roles: RoleOption[];
    submitting?: boolean;
    error?: string | null;
    onConfirm: (input: ApproveUserInput) => void;
    onClose: () => void;
}

function formatDate(value: string | null): string {
    if (!value) return '—';
    const d = new Date(String(value).replace(' ', 'T'));
    return Number.isNaN(d.getTime())
        ? '—'
        : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function ApproveUserModal({
    user,
    projects,
    roles,
    submitting = false,
    error = null,
    onConfirm,
    onClose,
}: ApproveUserModalProps) {
    // Default to the requested role; the admin may override before approving.
    const [role, setRole] = useState<string>(user.requestedRole ?? '');
    const [projectIds, setProjectIds] = useState<string[]>([]);
    const [notes, setNotes] = useState('');

    const toggleProject = (id: string) => {
        setProjectIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
    };

    const canSubmit = role !== '' && !submitting;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSubmit) return;
        onConfirm({
            role: role as ApproveUserInput['role'],
            projectIds,
            notes: notes.trim() || undefined,
        });
    };

    return (
        <Modal
            open
            onClose={onClose}
            preventClose={submitting}
            icon={ShieldCheck}
            iconTone="green"
            title="Approve User"
            subtitle={`${user.name} · ${user.email}`}
            footer={
                <>
                    <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
                        Cancel
                    </Button>
                    <Button type="submit" form="approve-user-form" variant="success" isLoading={submitting} disabled={!canSubmit}>
                        Approve User
                    </Button>
                </>
            }
        >
            <form id="approve-user-form" onSubmit={handleSubmit} className="space-y-5">
                {error && (
                    <div className="bg-[#FEF2F2] border border-[#EF4444]/30 text-[#B91C1C] text-sm px-4 py-3 rounded-xl">
                        {error}
                    </div>
                )}

                {/* Requested role + registration date (read-only context) */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-[#F8FAFC] rounded-xl px-4 py-3">
                        <p className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wider mb-1">
                            Requested Role
                        </p>
                        <p className="text-sm font-medium text-[#0F172A]">
                            {user.requestedRole ? roleLabel(user.requestedRole) : '—'}
                        </p>
                    </div>
                    <div className="bg-[#F8FAFC] rounded-xl px-4 py-3">
                        <p className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wider mb-1">
                            Registration Date
                        </p>
                        <p className="text-sm font-medium text-[#0F172A]">{formatDate(user.createdAt)}</p>
                    </div>
                </div>

                {/* Assigned role (defaults to the requested role; admin may change) */}
                <div>
                    <Label required>Assign Role</Label>
                    <CustomSelect
                        options={roles}
                        value={role}
                        onChange={setRole}
                        placeholder="Select a role…"
                        height={48}
                    />
                    <p className="text-xs text-[#94A3B8] mt-1.5">
                        Defaults to the requested role — change it only if necessary.
                    </p>
                </div>

                {/* Project assignment (optional, multi) */}
                <div>
                    <Label>Project Assignment</Label>
                    <div className="border-2 border-[#E5E7EB] rounded-xl max-h-44 overflow-y-auto divide-y divide-[#F1F5F9]">
                        {projects.length === 0 ? (
                            <p className="px-4 py-3 text-sm text-[#94A3B8]">
                                No active projects available to assign.
                            </p>
                        ) : (
                            projects.map((p) => {
                                const checked = projectIds.includes(p.id);
                                return (
                                    <label
                                        key={p.id}
                                        className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-[#F8FAFC]"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => toggleProject(p.id)}
                                            className="w-4 h-4 rounded border-[#E2E8F0] text-[#06B6D4] focus:ring-[#06B6D4]/30"
                                        />
                                        <span className="text-sm">
                                            <span className="font-mono text-[#06B6D4] font-semibold">
                                                {p.projectCode}
                                            </span>
                                            <span className="text-[#475569]"> — {p.projectName}</span>
                                        </span>
                                    </label>
                                );
                            })
                        )}
                    </div>
                    <p className="text-xs text-[#94A3B8] mt-1.5">
                        Optional. Multiple projects allowed. Assignable later too.
                    </p>
                </div>

                {/* Notes (optional) */}
                <div>
                    <Label>Notes</Label>
                    <TextArea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Optional internal notes about this approval…"
                        rows={3}
                        style={{ minHeight: '84px' }}
                    />
                </div>
            </form>
        </Modal>
    );
}
