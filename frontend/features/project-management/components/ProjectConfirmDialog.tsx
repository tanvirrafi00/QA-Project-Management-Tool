'use client';

/**
 * Confirmation dialog used for destructive project actions (archive / delete).
 *
 * Thin wrapper over the global `ConfirmDialog` so project archive/delete renders the SAME warning
 * card as every other destructive action in the app. Supports an optional list of warnings (from
 * the delete-check endpoint) and an optional secondary "archive instead" action.
 */

import { Archive } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

interface ProjectConfirmDialogProps {
    title: string;
    message: string;
    warnings?: string[];
    confirmLabel?: string;
    confirmVariant?: 'danger' | 'primary';
    secondaryLabel?: string;     // e.g. "Archive instead"
    loading?: boolean;
    onConfirm: () => void;
    onSecondary?: () => void;
    onClose: () => void;
}

export function ProjectConfirmDialog({
    title,
    message,
    warnings = [],
    confirmLabel = 'Confirm',
    confirmVariant = 'danger',
    secondaryLabel,
    loading = false,
    onConfirm,
    onSecondary,
    onClose,
}: ProjectConfirmDialogProps) {
    return (
        <ConfirmDialog
            title={title}
            message={message}
            warnings={warnings}
            confirmLabel={confirmLabel}
            confirmVariant={confirmVariant}
            secondaryLabel={secondaryLabel}
            secondaryIcon={onSecondary ? Archive : undefined}
            loading={loading}
            onConfirm={onConfirm}
            onSecondary={onSecondary}
            onClose={onClose}
        />
    );
}
