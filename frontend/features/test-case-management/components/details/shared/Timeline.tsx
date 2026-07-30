'use client';

/**
 * Timeline — generic vertical timeline (border-left rail + dots).
 * Used by the History section today; reusable for a future threaded-comments timeline.
 */
import { ReactNode } from 'react';

export interface TimelineItem {
    id: string;
    title: ReactNode;
    meta?: ReactNode;
    body?: ReactNode;
    by?: ReactNode;
    dotColor?: string;
}

export function Timeline({
    items,
    emptyLabel = 'No activity recorded yet.',
}: {
    items: TimelineItem[];
    emptyLabel?: string;
}) {
    if (items.length === 0) {
        return <p className="text-sm text-[#94A3B8]">{emptyLabel}</p>;
    }
    return (
        <ol className="relative border-l border-[#E2E8F0] ml-1 space-y-5">
            {items.map((item) => (
                <li key={item.id} className="pl-5 relative">
                    <span
                        className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full"
                        style={{ background: item.dotColor ?? '#06B6D4' }}
                    />
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-[#1E293B]">{item.title}</span>
                        {item.meta && <span className="text-xs text-[#94A3B8]">· {item.meta}</span>}
                    </div>
                    {item.body && <div className="text-xs text-[#64748B] mt-1">{item.body}</div>}
                    {item.by && <div className="text-[11px] text-[#94A3B8] mt-0.5">{item.by}</div>}
                </li>
            ))}
        </ol>
    );
}
