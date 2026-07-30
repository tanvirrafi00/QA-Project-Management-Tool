'use client';

/**
 * Alert — the SINGLE, app-wide inline contextual banner (docs/ui-standards.md).
 *
 * For rich, contextual messages that must stay visible while the user reads/fixes
 * something (form validation, generation errors, import issues). It shares the exact
 * color + icon language of the `Toast` system so the two feel like one design.
 *
 * For transient action feedback ("Saved", "Deleted", "Failed to load") use `useToast()`
 * instead — Alerts do not auto-dismiss.
 *
 *   <Alert type="error" title="Missing columns"
 *          description="Add 'Priority' and 'Expected Results' to every sheet." />
 *   <Alert type="warning" title="Heads up">This will overwrite existing data.</Alert>
 */

import { CheckCircle2, AlertCircle, AlertTriangle, Info, X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TOAST_CONFIG, type ToastType } from '@/components/ui/Toast';

// Reuse the toast palette so inline banners and toasts speak the same dialect.
const ICONS: Record<ToastType, LucideIcon> = {
    success: CheckCircle2,
    error: AlertCircle,
    warning: AlertTriangle,
    info: Info,
};

export interface AlertProps {
    type?: ToastType;
    /** Bold lead line. Optional — when omitted, the body sits next to the icon. */
    title?: React.ReactNode;
    /** Supporting copy / detail. */
    description?: React.ReactNode;
    /** Show a dismiss button (calls onDismiss). Omit to render a static banner. */
    onDismiss?: () => void;
    className?: string;
    children?: React.ReactNode;
}

export function Alert({
    type = 'info',
    title,
    description,
    onDismiss,
    className,
    children,
}: AlertProps) {
    const cfg = TOAST_CONFIG[type];
    const Icon = ICONS[type];

    return (
        <div
            role={type === 'error' ? 'alert' : 'status'}
            className={cn(
                'relative overflow-hidden rounded-xl border bg-white shadow-sm',
                'border-[#E2E8F0]',
                className,
            )}
        >
            {/* Accent bar */}
            <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: cfg.accent }} />

            <div className="flex items-start gap-3 pl-3.5 pr-3 py-3">
                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5', cfg.iconBg, cfg.iconColor)}>
                    <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                    {title && <p className={cn('text-sm font-semibold leading-snug', cfg.title)}>{title}</p>}
                    {description && (
                        <p className="text-xs text-[#64748B] mt-0.5 leading-relaxed break-words">{description}</p>
                    )}
                    {children && <div className="text-sm text-[#475569] leading-relaxed mt-1">{children}</div>}
                </div>
                {onDismiss && (
                    <button
                        type="button"
                        onClick={onDismiss}
                        aria-label="Dismiss"
                        className="w-6 h-6 inline-flex items-center justify-center rounded-md text-[#94A3B8] hover:text-[#1E293B] hover:bg-[#F1F5F9] flex-shrink-0 transition-colors"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>
        </div>
    );
}
