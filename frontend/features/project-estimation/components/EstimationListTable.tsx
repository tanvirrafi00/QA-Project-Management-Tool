'use client';

/**
 * Estimations table with role-aware workflow actions. Reused by the workspace Estimations tab, the
 * Review Queue, and the Approved list. The page owns the action handlers (service call + toast +
 * refresh); this component decides which buttons to show from status + role and gathers optional
 * review comments.
 *
 * Pagination is built in via the shared `usePagination` + `<Pagination>` (docs/ui-standards.md §6):
 * every row is reachable, no silent caps. Review comments are gathered through a proper `<Modal>`
 * (never a browser `prompt`).
 */

import { useState } from 'react';
import { ClipboardList, History, MessageSquare } from 'lucide-react';
import { Badge, Button, TextArea } from '@/components/core';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { Pagination, usePagination } from '@/components/ui/Pagination';
import type { ModuleEstimation } from '../types';

export type WorkflowAction =
    | 'submit' | 'resubmit' | 'approve' | 'request_revision' | 'reject' | 'reopen' | 'select_final';

/** Actions that open the comment modal before calling `onAction`. */
type CommentAction = 'request_revision' | 'reject';

const COMMENT_ACTION_META: Record<CommentAction, {
    title: string;
    subtitle: string;
    tone: 'amber' | 'red';
    confirmLabel: string;
    confirmVariant: 'primary' | 'danger';
}> = {
    request_revision: {
        title: 'Request Revision',
        subtitle: 'Let the engineer know what to change before they resubmit.',
        tone: 'amber',
        confirmLabel: 'Request Revision',
        confirmVariant: 'primary',
    },
    reject: {
        title: 'Reject Estimate',
        subtitle: 'Explain why this estimate is being rejected.',
        tone: 'red',
        confirmLabel: 'Reject Estimate',
        confirmVariant: 'danger',
    },
};

interface Props {
    estimations: ModuleEstimation[];
    moduleNameOf: (moduleId: string) => string;
    role?: string;
    /** Empty-state copy override (e.g. "No estimates awaiting review"). */
    emptyTitle?: string;
    emptyDescription?: string;
    onAction: (action: WorkflowAction, est: ModuleEstimation, comment?: string) => void;
    onHistory: (estimationId: string, label: string) => void;
    busyId?: string | null;
    /** Rows per page (defaults to 10 per ui-standards). */
    pageSize?: number;
}

function statusVariant(status: ModuleEstimation['status']) {
    switch (status) {
        case 'Approved': return 'success';
        case 'Submitted':
        case 'Under Review': return 'info';
        case 'Revision Requested': return 'warning';
        case 'Rejected': return 'error';
        default: return 'default';
    }
}

function isLead(role?: string) {
    return role === 'admin' || role === 'qa_lead';
}

export function EstimationListTable({
    estimations, moduleNameOf, role, emptyTitle, emptyDescription, onAction, onHistory, busyId,
    pageSize = 10,
}: Props) {
    // Hooks must run before any early return. `pageSize` (the prop) only seeds the initial value;
    // the hook owns the live rows-per-page the footer reflects and mutates.
    const {
        paginatedItems, page, totalPages, totalItems, startIdx, endIdx,
        pageSize: rowsPerPage, setPage, setPageSize: setRowsPerPage,
    } = usePagination(estimations, pageSize);

    // Pending comment action: opens the modal, then calls `onAction` with the entered comment.
    const [pending, setPending] = useState<{ action: CommentAction; est: ModuleEstimation } | null>(null);
    const [comment, setComment] = useState('');

    const act = (action: WorkflowAction, est: ModuleEstimation, withComment = false) => {
        if (withComment && (action === 'request_revision' || action === 'reject')) {
            setComment('');
            setPending({ action, est });
            return;
        }
        onAction(action, est, undefined);
    };

    const closeComment = () => {
        setPending(null);
        setComment('');
    };

    const confirmComment = () => {
        if (!pending) return;
        onAction(pending.action, pending.est, comment.trim() || undefined);
        closeComment();
    };

    const meta = pending ? COMMENT_ACTION_META[pending.action] : null;

    return (
        <>
            {estimations.length === 0 ? (
                <div className="bg-white rounded-2xl border border-[#E2E8F0]">
                    <EmptyState compact icon={ClipboardList}
                        title={emptyTitle ?? 'No estimations'}
                        description={emptyDescription ?? 'Estimates will appear here once created.'} />
                </div>
            ) : (
                <div className="bg-white rounded-2xl border border-[#E2E8F0] overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wider">Module</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wider">Engineer</th>
                                    <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wider">Hours</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wider">Cx / Risk</th>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wider">Status</th>
                                    <th className="text-right px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedItems.map((e) => {
                                    const label = `${moduleNameOf(e.moduleId)} · ${e.engineerName}`;
                                    const lead = isLead(role);
                                    const disabled = busyId === e.id;
                                    return (
                                        <tr key={e.id} className="border-b border-[#E2E8F0] last:border-0 hover:bg-[#F8FAFC]">
                                            <td className="px-4 py-3">
                                                <div className="font-medium text-[#0F172A]">{moduleNameOf(e.moduleId)}</div>
                                                {e.isFinalApproved && <Badge variant="info" size="sm">Final</Badge>}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-[#475569]">{e.engineerName}</td>
                                            <td className="px-4 py-3 text-right text-sm font-semibold text-[#0F172A]">{e.estimatedHours ?? '—'}</td>
                                            <td className="px-4 py-3 text-sm text-[#475569]">{e.complexity ?? '—'} / {e.riskLevel ?? '—'}</td>
                                            <td className="px-4 py-3"><Badge variant={statusVariant(e.status)} size="sm">{e.status}</Badge></td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                                    {e.status === 'Draft' && (
                                                        <Button size="sm" disabled={disabled} onClick={() => act('submit', e)}>Submit</Button>
                                                    )}
                                                    {e.status === 'Revision Requested' && (
                                                        <Button size="sm" disabled={disabled} onClick={() => act('resubmit', e)}>Resubmit</Button>
                                                    )}
                                                    {(e.status === 'Submitted' || e.status === 'Under Review') && lead && (
                                                        <>
                                                            <Button size="sm" variant="success" disabled={disabled} onClick={() => act('approve', e)}>Approve</Button>
                                                            <Button size="sm" variant="secondary" disabled={disabled} onClick={() => act('request_revision', e, true)}>Revise</Button>
                                                            <Button size="sm" variant="danger" disabled={disabled} onClick={() => act('reject', e, true)}>Reject</Button>
                                                        </>
                                                    )}
                                                    {e.status === 'Approved' && lead && (
                                                        <>
                                                            {!e.isFinalApproved && (
                                                                <Button size="sm" disabled={disabled} onClick={() => act('select_final', e)}>Select Final</Button>
                                                            )}
                                                            <Button size="sm" variant="secondary" disabled={disabled} onClick={() => act('reopen', e)}>Reopen</Button>
                                                        </>
                                                    )}
                                                    <Button size="sm" variant="ghost" disabled={disabled} onClick={() => onHistory(e.id, label)}
                                                        leftIcon={<History className="w-4 h-4" />}>History</Button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    <Pagination
                        page={page}
                        totalPages={totalPages}
                        totalItems={totalItems}
                        startIdx={startIdx}
                        endIdx={endIdx}
                        pageSize={rowsPerPage}
                        onPageChange={setPage}
                        onPageSizeChange={setRowsPerPage}
                    />
                </div>
            )}

            {meta && pending && (
                <Modal
                    open
                    onClose={closeComment}
                    size="sm"
                    icon={MessageSquare}
                    iconTone={meta.tone}
                    title={meta.title}
                    subtitle={meta.subtitle}
                    footer={
                        <>
                            <Button variant="secondary" onClick={closeComment}>Cancel</Button>
                            <Button variant={meta.confirmVariant} onClick={confirmComment}>{meta.confirmLabel}</Button>
                        </>
                    }
                >
                    <div className="space-y-2">
                        <label htmlFor="estimation-comment" className="text-xs font-semibold text-[#475569]">
                            Comment <span className="font-normal text-[#94A3B8]">(optional)</span>
                        </label>
                        <TextArea
                            id="estimation-comment"
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            rows={4}
                            autoFocus
                            placeholder="Add context for this decision…"
                            className="min-h-[96px]"
                        />
                    </div>
                </Modal>
            )}
        </>
    );
}
