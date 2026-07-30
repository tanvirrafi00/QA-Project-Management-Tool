'use client';

/**
 * SectionCard — the standard container for every Test Case Details section.
 *
 * White card (`rounded-2xl border-[#E2E8F0]`, docs/ui-standards.md §2) with an anchored
 * `id`, a header (icon + title + optional description + optional action), and a body.
 * `scroll-mt-[96px]` clears the sticky details header when jump-scrolled from the nav.
 */
import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SectionCardProps {
    id: string;
    title: string;
    icon?: ReactNode;
    description?: ReactNode;
    action?: ReactNode;
    children: ReactNode;
    className?: string;
    bodyClassName?: string;
}

export function SectionCard({
    id, title, icon, description, action, children, className, bodyClassName,
}: SectionCardProps) {
    return (
        <section
            id={id}
            className={cn('bg-white rounded-2xl border border-[#E2E8F0] scroll-mt-[96px]', className)}
        >
            <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-[#F1F5F9]">
                <div className="flex items-center gap-2.5 min-w-0">
                    {icon && <span className="text-[#06B6D4] flex-shrink-0">{icon}</span>}
                    <div className="min-w-0">
                        <h2 className="text-base font-semibold text-[#1E293B] truncate">{title}</h2>
                        {description && (
                            <p className="text-xs text-[#94A3B8] truncate">{description}</p>
                        )}
                    </div>
                </div>
                {action && <div className="flex-shrink-0">{action}</div>}
            </div>
            <div className={cn('p-6', bodyClassName)}>{children}</div>
        </section>
    );
}
