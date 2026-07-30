'use client';

/**
 * ConfirmDialog — the SINGLE, app-wide confirmation/warning dialog (docs/ui-standards.md).
 *
 * Every destructive or irreversible action (delete a test case, delete a whole module, archive /
 * delete a project, …) goes through this so the warning card looks and behaves identically
 * everywhere: same overlay, icon chip, entity highlight, optional warning bullets, and a
 * consistent Cancel / Confirm (danger) footer. Built on the shared `Modal` shell.
 *
 *   <ConfirmDialog title="Delete Module" entity="Login Module"
 *       message="This permanently removes all 12 test cases in this module."
 *       warnings={['Linked bugs will keep their IDs but lose this test-case reference.']}
 *       confirmLabel="Delete Module" onConfirm={…} onClose={…} />
 */

import { AlertTriangle, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/core';
import { Modal } from '@/components/ui/Modal';

export interface ConfirmDialogProps {
    /** Dialog headline (e.g. "Delete Module"). */
    title: string;
    /** Explanatory body copy. */
    message: React.ReactNode;
    /** Optional highlighted entity name shown in a tinted chip (the thing being deleted). */
    entity?: string;
    /** Optional warning bullets (e.g. cascade effects from a delete-check). */
    warnings?: string[];
    /** Confirm button label. */
    confirmLabel?: string;
    /** Confirm button tone — `danger` (default) for destructive actions, `primary` otherwise. */
    confirmVariant?: 'danger' | 'primary';
    /** Header icon (defaults to a warning triangle). */
    icon?: LucideIcon;
    /** Header icon chip tone (defaults to red). */
    iconTone?: 'red' | 'amber' | 'cyan' | 'green' | 'blue' | 'slate';
    /** Cancel button label (defaults to "Cancel"). */
    cancelLabel?: string;
    /** Optional secondary action (e.g. "Archive instead") rendered between Cancel and Confirm. */
    secondaryLabel?: string;
    secondaryIcon?: LucideIcon;
    onSecondary?: () => void;
    /** Locks all interactions + shows a spinner while the action is in flight. */
    loading?: boolean;
    onConfirm: () => void;
    onClose: () => void;
}

export function ConfirmDialog({
    title,
    message,
    entity,
    warnings = [],
    confirmLabel = 'Confirm',
    confirmVariant = 'danger',
    icon: Icon = AlertTriangle,
    iconTone = 'red',
    cancelLabel = 'Cancel',
    secondaryLabel,
    secondaryIcon: SecondaryIcon,
    onSecondary,
    loading = false,
    onConfirm,
    onClose,
}: ConfirmDialogProps) {
    return (
        <Modal
            open
            onClose={onClose}
            preventClose={loading}
            size="sm"
            icon={Icon}
            iconTone={iconTone}
            title={title}
            footer={
                <>
                    <Button variant="secondary" size="sm" onClick={onClose} disabled={loading}>
                        {cancelLabel}
                    </Button>
                    {onSecondary && secondaryLabel && (
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={onSecondary}
                            disabled={loading}
                            leftIcon={SecondaryIcon ? <SecondaryIcon className="w-4 h-4" /> : undefined}
                        >
                            {secondaryLabel}
                        </Button>
                    )}
                    <Button
                        variant={confirmVariant}
                        size="sm"
                        onClick={onConfirm}
                        disabled={loading}
                        isLoading={loading}
                    >
                        {loading ? 'Working…' : confirmLabel}
                    </Button>
                </>
            }
        >
            <div className="space-y-3">
                {entity && (
                    <div className="rounded-xl bg-[#FEF2F2] border border-[#FECACA] px-3 py-2">
                        <span className="text-sm font-semibold text-[#991B1B] break-words">{entity}</span>
                    </div>
                )}

                <p className="text-sm text-[#475569] leading-relaxed">{message}</p>

                {warnings.length > 0 && (
                    <div className="rounded-xl bg-[#FFFBEB] border border-[#FDE68A] p-3 space-y-1.5">
                        {warnings.map((w, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs text-[#92400E]">
                                <span className="w-1 h-1 rounded-full bg-[#F59E0B] mt-1.5 flex-shrink-0" />
                                <span>{w}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </Modal>
    );
}
