'use client';

/**
 * ChartCard
 * =============================================================================
 * Shared chart container used by every dashboard page (bug-dashboard, test-management,
 * dashboard). It standardizes the card chrome (title + icon + border) AND guarantees
 * that an empty/undefined dataset never renders a broken recharts axis/legend.
 *
 * How it works:
 *  - Pass `data` = the array that drives the chart (e.g. `data.layerComparison`).
 *  - When `safeArray(data)` is empty, the card renders `<EmptyChart />` instead of
 *    `children`, while keeping the card height intact (no layout shift).
 *  - `height` reserves vertical space so populated ↔ empty transitions don't jump.
 *
 * Drop-in for the per-page `ChartCard` helpers that previously only wrapped children.
 */

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { safeArray } from '@/lib/safe-value';
import { EmptyChart } from '@/components/states';

export interface ChartCardProps {
    title: string;
    icon?: ReactNode;
    /** Dataset driving the chart. Empty/undefined → EmptyChart is shown. */
    data?: unknown[];
    /** Reserved height (px) for the chart body, preserved on empty state. */
    height?: number;
    /** The recharts subtree (ResponsiveContainer + chart). Rendered only when data exists. */
    children?: ReactNode;
    className?: string;
    /** Override the empty-state copy. */
    emptyTitle?: string;
    emptyDescription?: string;
}

export function ChartCard({
    title,
    icon,
    data,
    height = 280,
    children,
    className,
    emptyTitle,
    emptyDescription,
}: ChartCardProps) {
    const dataset = safeArray(data);
    const hasData = dataset.length > 0;

    return (
        <div className={cn('bg-white rounded-2xl border border-[#E2E8F0] p-6', className)}>
            <div className="flex items-center gap-2 mb-4">
                <span className="text-[#64748B]">{icon}</span>
                <h3 className="text-base font-semibold text-[#1E293B]">{title}</h3>
            </div>
            {/*
              Body: when data exists, render children directly (recharts ResponsiveContainer
              manages its own sizing — do NOT wrap it in a flex container, which can collapse
              its measured height). When empty, reserve a fixed-height centered EmptyChart so
              the card never shrinks/jumps between states.
            */}
            {hasData ? (
                children
            ) : (
                <div style={{ height }} className="w-full flex items-center justify-center">
                    <div className="w-full">
                        <EmptyChart title={emptyTitle} description={emptyDescription} />
                    </div>
                </div>
            )}
        </div>
    );
}
