'use client';

/**
 * Modal — the single, shared dialog shell for the whole app (docs/ui-standards.md §5).
 *
 * Every form / confirm / details dialog composes this so the overlay, backdrop, panel sizing,
 * header layout, and close behavior (backdrop click + Escape, lockable while submitting) are
 * identical everywhere. Callers own the body content and (optionally) a footer.
 *
 *   <Modal open icon={ShieldCheck} iconTone="green" title="Approve User"
 *          footer={<><Button secondary>Cancel</Button><Button success>Approve</Button></>}>
 *     …body…
 *   </Modal>
 *
 * For a fully custom header (e.g. a gradient profile banner), pass `header={<…/>}` instead of
 * `icon`/`title`/`subtitle` — you own the close button in that node.
 */

import { useEffect, useRef } from 'react';
import { X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const SIZES = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl' } as const;

/** Icon-chip palettes (each tone = a soft bg + the matching icon color). */
const ICON_TONES = {
    cyan: 'bg-[#ECFEFF] text-[#06B6D4]',
    green: 'bg-[#ECFDF5] text-[#10B981]',
    red: 'bg-[#FEF2F2] text-[#DC2626]',
    amber: 'bg-[#FFFBEB] text-[#F59E0B]',
    blue: 'bg-[#EFF6FF] text-[#3B82F6]',
    slate: 'bg-[#F1F5F9] text-[#64748B]',
} as const;

export interface ModalProps {
    /** Controlled visibility — renders nothing when false. */
    open: boolean;
    onClose: () => void;
    size?: keyof typeof SIZES;
    /** Standard header icon (rendered in a tinted chip). Omit when using a custom `header`. */
    icon?: LucideIcon;
    iconTone?: keyof typeof ICON_TONES;
    title?: React.ReactNode;
    subtitle?: React.ReactNode;
    /** Fully custom header node (overrides icon/title/subtitle; you render its close button). */
    header?: React.ReactNode;
    /** Optional footer bar (bordered, soft background) — usually the action buttons. */
    footer?: React.ReactNode;
    /** Extra classes on the body wrapper (default padding is `px-6 py-5`). */
    bodyClassName?: string;
    /** Lock all close interactions (backdrop/Escape/close button) — set while submitting. */
    preventClose?: boolean;
    children: React.ReactNode;
}

/** Focusable elements inside a container — used to trap Tab focus within the modal. */
function getFocusable(root: HTMLElement): HTMLElement[] {
    return Array.from(
        root.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
    );
}

export function Modal({
    open,
    onClose,
    size = 'md',
    icon: Icon,
    iconTone = 'cyan',
    title,
    subtitle,
    header,
    footer,
    bodyClassName,
    preventClose = false,
    children,
}: ModalProps) {
    const panelRef = useRef<HTMLDivElement>(null);
    // Latest-value refs: the effect below depends only on `open`, so it doesn't re-run (and reset
    // focus) when the parent re-renders with a fresh inline `onClose` while the modal is open.
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;
    const preventCloseRef = useRef(preventClose);
    preventCloseRef.current = preventClose;

    // Focus management (move in / restore), Tab-trap, Escape-to-close, and background scroll lock.
    useEffect(() => {
        if (!open) return;

        // Lock background scroll while the modal is open.
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        // Remember the trigger so focus can be restored on close.
        const trigger = document.activeElement as HTMLElement | null;

        // Move focus into the modal — first focusable element, else the panel itself.
        const panel = panelRef.current;
        if (panel) {
            const focusables = getFocusable(panel);
            (focusables[0] ?? panel).focus();
        }

        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (!preventCloseRef.current) onCloseRef.current();
                return;
            }
            if (e.key === 'Tab' && panelRef.current) {
                const items = getFocusable(panelRef.current);
                if (items.length === 0) return;
                const first = items[0];
                const last = items[items.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        };
        document.addEventListener('keydown', onKey);

        return () => {
            document.body.style.overflow = prevOverflow;
            document.removeEventListener('keydown', onKey);
            trigger?.focus?.();
        };
    }, [open]);

    if (!open) return null;

    const showStandardHeader = !header && (title || Icon);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/40"
                onClick={() => !preventClose && onClose()}
                aria-hidden
            />

            {/* Panel */}
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                tabIndex={-1}
                className={cn(
                    'relative bg-white rounded-2xl shadow-2xl w-full max-h-[90vh] overflow-y-auto focus:outline-none',
                    SIZES[size],
                )}
            >
                {/* Custom header (caller-owned) */}
                {header}

                {/* Standard header */}
                {showStandardHeader && (
                    <div className="flex items-center justify-between px-6 py-5 border-b border-[#E2E8F0]">
                        <div className="flex items-center gap-3 min-w-0">
                            {Icon && (
                                <div
                                    className={cn(
                                        'w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0',
                                        ICON_TONES[iconTone],
                                    )}
                                >
                                    <Icon className="w-4 h-4" />
                                </div>
                            )}
                            <div className="min-w-0">
                                {title && (
                                    <h2 className="text-base font-semibold text-[#1E293B] truncate">
                                        {title}
                                    </h2>
                                )}
                                {subtitle && (
                                    <p className="text-xs text-[#94A3B8] truncate">{subtitle}</p>
                                )}
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => !preventClose && onClose()}
                            disabled={preventClose}
                            aria-label="Close"
                            className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-[#94A3B8] hover:text-[#1E293B] hover:bg-[#F1F5F9] disabled:opacity-50 flex-shrink-0"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                )}

                {/* Body */}
                <div className={cn('px-6 py-5', bodyClassName)}>{children}</div>

                {/* Footer */}
                {footer && (
                    <div className="flex items-center justify-end gap-3 px-6 py-4 bg-[#F8FAFC] border-t border-[#E2E8F0]">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
}
