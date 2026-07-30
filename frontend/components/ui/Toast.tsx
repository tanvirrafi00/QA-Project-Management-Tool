'use client';

/**
 * Toast — the SINGLE, app-wide transient notification system (docs/ui-standards.md).
 *
 * Every non-blocking feedback message (success / error / warning / info) goes through
 * `useToast()` so notifications look and behave identically everywhere: same icon,
 * color language, position (top-right), auto-dismiss, pause-on-hover, and manual close.
 *
 * Use inline `Alert` only for rich, contextual errors the user must read and fix
 * (e.g. import validation, form errors). Toasts are for transient action feedback.
 *
 *   const toast = useToast();
 *   toast.success('Project archived.');
 *   toast.error('Failed to load test cases.', { description: 'Check your connection.' });
 *   toast.warning('Approaching the row limit.');
 *   toast.info('Synced with the dashboard.');
 *
 * Mount <ToastProvider> once (AppProviders) — it renders the <Toaster/> stack itself.
 */

import {
    createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
    type ReactNode,
} from 'react';
import {
    CheckCircle2, AlertCircle, AlertTriangle, Info, X, type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastOptions {
    /** Optional secondary line under the title. */
    description?: ReactNode;
    /** Auto-dismiss delay in ms. 0 = sticky (manual close only). Defaults by type. */
    duration?: number;
}

interface ToastItem {
    id: number;
    type: ToastType;
    title: ReactNode;
    description?: ReactNode;
    duration: number;
}

interface ToastContextValue {
    success: (title: ReactNode, options?: ToastOptions) => void;
    error: (title: ReactNode, options?: ToastOptions) => void;
    warning: (title: ReactNode, options?: ToastOptions) => void;
    info: (title: ReactNode, options?: ToastOptions) => void;
    dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/** Max simultaneous toasts — older ones are dropped to avoid flooding. */
const MAX_VISIBLE = 5;

const DEFAULT_DURATION: Record<ToastType, number> = {
    success: 4000,
    info: 4000,
    warning: 5000,
    error: 6000,
};

/**
 * Shared color language (also used by Alert) so toasts and inline banners speak the
 * same visual dialect: accent bar + soft icon chip + tinted title text.
 */
export const TOAST_CONFIG: Record<
    ToastType,
    { icon: LucideIcon; accent: string; iconBg: string; iconColor: string; title: string }
> = {
    success: { icon: CheckCircle2, accent: '#22C55E', iconBg: 'bg-[#D1FAE5]', iconColor: 'text-[#16A34A]', title: 'text-[#065F46]' },
    error: { icon: AlertCircle, accent: '#EF4444', iconBg: 'bg-[#FEE2E2]', iconColor: 'text-[#DC2626]', title: 'text-[#991B1B]' },
    warning: { icon: AlertTriangle, accent: '#F59E0B', iconBg: 'bg-[#FFEDD5]', iconColor: 'text-[#EA580C]', title: 'text-[#9A3412]' },
    info: { icon: Info, accent: '#06B6D4', iconBg: 'bg-[#CFFAFE]', iconColor: 'text-[#0891B2]', title: 'text-[#0E7490]' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const idRef = useRef(0);

    const dismiss = useCallback((id: number) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const push = useCallback((type: ToastType, title: ReactNode, options?: ToastOptions) => {
        const id = ++idRef.current;
        const duration = options?.duration ?? DEFAULT_DURATION[type];
        setToasts(prev => [...prev, { id, type, title, description: options?.description, duration }].slice(-MAX_VISIBLE));
    }, []);

    const value = useMemo<ToastContextValue>(
        () => ({
            success: (t, o) => push('success', t, o),
            error: (t, o) => push('error', t, o),
            warning: (t, o) => push('warning', t, o),
            info: (t, o) => push('info', t, o),
            dismiss,
        }),
        [push, dismiss],
    );

    return (
        <ToastContext.Provider value={value}>
            {children}
            <Toaster toasts={toasts} onDismiss={dismiss} />
        </ToastContext.Provider>
    );
}

export function useToast(): ToastContextValue {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
    return ctx;
}

/* ═══════════════════════════════════════════════════ */
/* ═══ RENDERER ══════════════════════════════════════ */
/* ═══════════════════════════════════════════════════ */

function Toaster({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: number) => void }) {
    return (
        <div className="fixed top-5 right-5 z-[70] flex flex-col gap-3 w-[calc(100vw-2.5rem)] max-w-sm pointer-events-none">
            {toasts.map(t => (
                <ToastCard key={t.id} toast={t} onDismiss={onDismiss} />
            ))}
        </div>
    );
}

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
    const cfg = TOAST_CONFIG[toast.type];
    const Icon = cfg.icon;
    const [shown, setShown] = useState(false);
    const [paused, setPaused] = useState(false);

    // Enter animation (slide-in + fade) on mount.
    useEffect(() => {
        const raf = requestAnimationFrame(() => setShown(true));
        return () => cancelAnimationFrame(raf);
    }, []);

    // Auto-dismiss; paused while hovered. Re-arms when un-paused.
    useEffect(() => {
        if (toast.duration <= 0 || paused) return;
        const timer = setTimeout(() => onDismiss(toast.id), toast.duration);
        return () => clearTimeout(timer);
    }, [toast.duration, toast.id, paused, onDismiss]);

    return (
        <div
            role={toast.type === 'error' ? 'alert' : 'status'}
            aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            className={cn(
                'pointer-events-auto relative overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-lg shadow-black/5',
                'transition-all duration-300 ease-out',
                shown ? 'translate-x-0 opacity-100' : 'translate-x-6 opacity-0',
            )}
        >
            {/* Accent bar */}
            <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: cfg.accent }} />

            <div className="flex items-start gap-3 pl-3.5 pr-3 py-3">
                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5', cfg.iconBg, cfg.iconColor)}>
                    <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                    <p className={cn('text-sm font-semibold leading-snug', cfg.title)}>{toast.title}</p>
                    {toast.description && (
                        <p className="text-xs text-[#64748B] mt-0.5 leading-relaxed break-words">{toast.description}</p>
                    )}
                </div>
                <button
                    type="button"
                    onClick={() => onDismiss(toast.id)}
                    aria-label="Dismiss notification"
                    className="w-6 h-6 inline-flex items-center justify-center rounded-md text-[#94A3B8] hover:text-[#1E293B] hover:bg-[#F1F5F9] flex-shrink-0 transition-colors"
                >
                    <X className="w-3.5 h-3.5" />
                </button>
            </div>
        </div>
    );
}
