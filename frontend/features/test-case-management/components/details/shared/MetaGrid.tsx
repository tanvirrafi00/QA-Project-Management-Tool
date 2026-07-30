'use client';

/**
 * MetaGrid — responsive label/value grid for metadata (generalizes the drawer's PropField).
 * A `placeholder` item renders a muted "— coming soon" value for fields not yet in the
 * data model (Reviewer, Created By, Source, Execution Type, …), keeping the layout honest.
 */
import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface MetaItem {
    label: string;
    value?: ReactNode;
    /** Accent color applied to a string value (e.g. priority). Ignored for node values. */
    color?: string;
    /** Render a muted "coming soon" placeholder instead of a value. */
    placeholder?: boolean;
}

export function MetaGrid({
    items,
    columns = 3,
    className,
}: {
    items: MetaItem[];
    columns?: 2 | 3 | 4;
    className?: string;
}) {
    const cols = columns === 2
        ? 'sm:grid-cols-2'
        : columns === 4
            ? 'sm:grid-cols-2 lg:grid-cols-4'
            : 'sm:grid-cols-2 lg:grid-cols-3';
    return (
        <dl className={cn('grid grid-cols-1 gap-x-6 gap-y-4', cols, className)}>
            {items.map((item, i) => (
                <div key={i} className="min-w-0">
                    <dt className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wider">
                        {item.label}
                    </dt>
                    <dd
                        className="text-sm font-medium text-[#1E293B] mt-1 break-words"
                        style={item.color && typeof item.value === 'string' ? { color: item.color } : undefined}
                    >
                        {item.placeholder ? (
                            <span className="text-[#94A3B8] italic font-normal">— coming soon</span>
                        ) : (
                            item.value ?? '—'
                        )}
                    </dd>
                </div>
            ))}
        </dl>
    );
}
