'use client';

/**
 * Review History modal — the append-only audit trail for one estimate (status transitions + the
 * lead's final selection), fetched from /estimations/:id/review-history.
 */

import { useEffect, useState } from 'react';
import { History, Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/core';
import { EmptyState } from '@/components/ui/EmptyState';
import { estimationService } from '../services/estimation.service';
import type { EstimationReviewEvent } from '../types';

interface Props {
    estimationId: string;
    label?: string;
    onClose: () => void;
}

const ACTION_LABEL: Record<string, string> = {
    submit: 'Submitted',
    resubmit: 'Resubmitted',
    approve: 'Approved',
    reject: 'Rejected',
    request_revision: 'Revision requested',
    reopen: 'Reopened',
    select_final: 'Selected as final',
};

export function ReviewHistoryModal({ estimationId, label, onClose }: Props) {
    const [events, setEvents] = useState<EstimationReviewEvent[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;
        (async () => {
            const res = await estimationService.getReviewEvents(estimationId);
            if (active) {
                setEvents(res.success && res.data ? res.data : []);
                setLoading(false);
            }
        })();
        return () => { active = false; };
    }, [estimationId]);

    return (
        <Modal open onClose={onClose} icon={History} iconTone="cyan" title="Review History" subtitle={label} size="md">
            {loading ? (
                <div className="flex items-center justify-center py-10">
                    <Loader2 className="w-6 h-6 text-[#06B6D4] animate-spin" />
                </div>
            ) : events.length === 0 ? (
                <EmptyState compact icon={History} title="No review activity yet"
                    description="Status transitions and review comments will appear here." />
            ) : (
                <ol className="space-y-3">
                    {events.map((e) => (
                        <li key={e.id} className="flex gap-3 items-start">
                            <div className="w-2 h-2 rounded-full bg-[#06B6D4] mt-2 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-semibold text-[#0F172A]">
                                        {ACTION_LABEL[e.action] ?? e.action}
                                    </span>
                                    {e.fromStatus && e.toStatus && (
                                        <Badge variant="default" size="sm">{e.fromStatus} → {e.toStatus}</Badge>
                                    )}
                                </div>
                                <div className="text-xs text-[#64748B] mt-0.5">
                                    {e.actorName || e.actorId || 'System'} · {new Date(e.createdAt).toLocaleString()}
                                </div>
                                {e.comment && (
                                    <div className="text-sm text-[#475569] mt-1 bg-[#F8FAFC] rounded-lg px-3 py-2 border border-[#E2E8F0]">
                                        {e.comment}
                                    </div>
                                )}
                            </div>
                        </li>
                    ))}
                </ol>
            )}
        </Modal>
    );
}
