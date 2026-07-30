'use client';

/**
 * EmptySection — consistent empty/coming-soon body for a details section.
 * - `empty` → standard `EmptyState` (e.g. "No related bugs").
 * - `comingSoon` → muted, dashed placeholder for sections with no backend yet
 *   (Attachments, per-case AI Insights, execution env/…), so the layout reads as complete
 *   without fabricating data.
 */
import { Lock, type LucideIcon } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';

interface EmptySectionProps {
    variant?: 'empty' | 'comingSoon';
    icon?: LucideIcon;
    title?: string;
    description?: string;
    action?: { label: string; onClick: () => void };
}

export function EmptySection({ variant = 'empty', icon, title, description, action }: EmptySectionProps) {
    if (variant === 'comingSoon') {
        return (
            <div className="flex flex-col items-center justify-center text-center py-10 px-4 rounded-xl bg-[#F8FAFC] border border-dashed border-[#E2E8F0]">
                <div className="w-12 h-12 rounded-xl bg-[#F1F5F9] flex items-center justify-center mb-3">
                    <Lock className="w-5 h-5 text-[#94A3B8]" />
                </div>
                <h4 className="text-sm font-semibold text-[#64748B]">{title ?? 'Coming soon'}</h4>
                <p className="text-xs text-[#94A3B8] mt-1 max-w-sm leading-relaxed">
                    {description ?? 'This section is on the roadmap.'}
                </p>
            </div>
        );
    }
    return (
        <EmptyState
            icon={icon}
            title={title}
            description={description}
            compact
            action={action ? { label: action.label, onClick: action.onClick, variant: 'secondary' } : undefined}
        />
    );
}
