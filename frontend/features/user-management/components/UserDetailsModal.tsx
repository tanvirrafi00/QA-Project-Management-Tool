'use client';

/**
 * UserDetailsModal — centered profile/details dialog for a user (replaces the earlier side drawer).
 * Gradient header with initials avatar + status, a clean info grid, a highlighted rejection banner
 * when relevant, and contextual action buttons in the footer. Built on the shared `Modal` shell.
 */

import { X } from 'lucide-react';
import { Check, Ban } from 'lucide-react';
import { Button } from '@/components/core';
import { Modal } from '@/components/ui/Modal';
import { UserStatusBadge, roleLabel } from './UserStatusBadge';
import type { UserAccount } from '../types';

export type DetailAction = 'approve' | 'reject';

export interface UserDetailsModalProps {
    user: UserAccount | null;
    onAction: (kind: DetailAction, user: UserAccount) => void;
    onClose: () => void;
}

function formatDate(value: string | null): string {
    if (!value) return '—';
    const d = new Date(String(value).replace(' ', 'T'));
    return Number.isNaN(d.getTime())
        ? '—'
        : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(value: string | null): string {
    if (!value) return 'Never';
    const d = new Date(String(value).replace(' ', 'T'));
    return Number.isNaN(d.getTime())
        ? 'Never'
        : d.toLocaleString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
          });
}

function InfoTile({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="bg-[#F8FAFC] rounded-xl px-4 py-3">
            <dt className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wider mb-1">
                {label}
            </dt>
            <dd className="text-sm text-[#0F172A] font-medium break-words">{children}</dd>
        </div>
    );
}

export function UserDetailsModal({ user, onAction, onClose }: UserDetailsModalProps) {
    if (!user) return null;

    const initials =
        user.name
            .split(' ')
            .map((p) => p.charAt(0))
            .filter(Boolean)
            .slice(0, 2)
            .join('')
            .toUpperCase() || '?';

    // Custom gradient header (caller owns the close button).
    const header = (
        <div className="relative bg-gradient-to-br from-[#06B6D4] to-[#3B82F6] px-6 pt-6 pb-5">
            <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="absolute top-4 right-4 w-8 h-8 inline-flex items-center justify-center rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition-colors"
            >
                <X className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-4 pr-8">
                <div className="w-16 h-16 rounded-2xl bg-white/20 ring-2 ring-white/30 backdrop-blur flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
                    {initials}
                </div>
                <div className="min-w-0">
                    <h2 className="text-xl font-bold text-white truncate">{user.name}</h2>
                    <p className="text-sm text-white/85 truncate">{user.email}</p>
                    <div className="mt-2">
                        <UserStatusBadge status={user.status} />
                    </div>
                </div>
            </div>
        </div>
    );

    // Contextual footer actions per status.
    const footer = (
        <>
            <Button variant="secondary" onClick={onClose}>
                Close
            </Button>
            {user.status === 'pending_approval' && (
                <>
                    <Button variant="danger" leftIcon={<Ban className="w-4 h-4" />} onClick={() => onAction('reject', user)}>
                        Reject
                    </Button>
                    <Button variant="success" leftIcon={<Check className="w-4 h-4" />} onClick={() => onAction('approve', user)}>
                        Approve
                    </Button>
                </>
            )}
        </>
    );

    return (
        <Modal open onClose={onClose} header={header} footer={footer} size="md" bodyClassName="space-y-5">
            {user.status === 'rejected' && (
                <div className="bg-[#FEF2F2] border border-[#FECACA] rounded-xl px-4 py-3">
                    <p className="text-[11px] font-semibold text-[#B91C1C] uppercase tracking-wider mb-1">
                        Rejection Reason
                    </p>
                    <p className="text-sm text-[#7F1D1D]">
                        {user.rejectionReason || 'No reason provided.'}
                    </p>
                </div>
            )}
            {user.status === 'pending_approval' && (
                <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-xl px-4 py-3 text-sm text-[#B45309]">
                    Awaiting administrator approval.
                </div>
            )}

            <dl className="grid grid-cols-2 gap-3">
                <InfoTile label="Role">{roleLabel(user.role)}</InfoTile>
                <InfoTile label="Registered">{formatDate(user.createdAt)}</InfoTile>
                <InfoTile label="Last Login">{formatDateTime(user.lastLoginAt)}</InfoTile>
                <InfoTile label="User ID">
                    <span className="font-mono text-xs">{user.id.slice(0, 8)}</span>
                </InfoTile>
            </dl>
        </Modal>
    );
}
