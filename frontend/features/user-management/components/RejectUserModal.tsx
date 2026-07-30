'use client';

/**
 * RejectUserModal — admin rejection form. Collects an optional reason and submits via the page's
 * `onConfirm`. Built on the shared `Modal` shell.
 */

import { useState } from 'react';
import { UserX } from 'lucide-react';
import { Button, TextArea, Label } from '@/components/core';
import { Modal } from '@/components/ui/Modal';
import type { RejectUserInput, UserAccount } from '../types';

export interface RejectUserModalProps {
    user: UserAccount;
    submitting?: boolean;
    error?: string | null;
    onConfirm: (input: RejectUserInput) => void;
    onClose: () => void;
}

export function RejectUserModal({
    user,
    submitting = false,
    error = null,
    onConfirm,
    onClose,
}: RejectUserModalProps) {
    const [reason, setReason] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (submitting) return;
        onConfirm({ reason: reason.trim() || undefined });
    };

    return (
        <Modal
            open
            onClose={onClose}
            preventClose={submitting}
            icon={UserX}
            iconTone="red"
            title="Reject User Registration"
            subtitle={`${user.name} · ${user.email}`}
            footer={
                <>
                    <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
                        Cancel
                    </Button>
                    <Button type="submit" form="reject-user-form" variant="danger" isLoading={submitting} disabled={submitting}>
                        Reject User
                    </Button>
                </>
            }
        >
            <form id="reject-user-form" onSubmit={handleSubmit} className="space-y-5">
                {error && (
                    <div className="bg-[#FEF2F2] border border-[#EF4444]/30 text-[#B91C1C] text-sm px-4 py-3 rounded-xl">
                        {error}
                    </div>
                )}

                <p className="text-sm text-[#475569]">
                    The user will be marked <span className="font-semibold text-[#DC2626]">Rejected</span> and
                    will not be able to log in. This can be undone by approving the account later.
                </p>

                <div>
                    <Label>Reason</Label>
                    <TextArea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Optional rejection reason…"
                        rows={4}
                        style={{ minHeight: '108px' }}
                    />
                    <p className="text-xs text-[#94A3B8] mt-1.5">
                        Stored on the account and visible to other administrators.
                    </p>
                </div>
            </form>
        </Modal>
    );
}
