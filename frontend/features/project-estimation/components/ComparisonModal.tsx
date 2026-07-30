'use client';

/**
 * Lead comparison view — all engineers' estimates for one module side by side, with a
 * "Select as final" action (sets exactly one isFinalApproved per module). Only approved estimates
 * are eligible; only leads/admins see the select action (`canReview`).
 */

import { useCallback, useEffect, useState } from 'react';
import { GitCompare, Loader2, CheckCircle2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button, Badge } from '@/components/core';
import { EmptyState } from '@/components/ui/EmptyState';
import { estimationService } from '../services/estimation.service';
import type { ModuleEstimation } from '../types';

interface Props {
    moduleId: string;
    moduleName: string;
    canReview: boolean;
    onClose: () => void;
    onChanged: () => void;
}

export function ComparisonModal({ moduleId, moduleName, canReview, onClose, onChanged }: Props) {
    const [estimates, setEstimates] = useState<ModuleEstimation[]>([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        const res = await estimationService.getComparisons(moduleId);
        setEstimates(res.success && res.data ? res.data : []);
        setLoading(false);
    }, [moduleId]);

    useEffect(() => { load(); }, [load]);

    const handleSelect = async (id: string) => {
        setBusyId(id);
        setError(null);
        const res = await estimationService.selectFinal(id);
        setBusyId(null);
        if (res.success) {
            await load();
            onChanged();
        } else {
            setError(res.error || 'Failed to select final estimate');
        }
    };

    return (
        <Modal open onClose={onClose} icon={GitCompare} iconTone="cyan" title="Compare Estimates" subtitle={moduleName} size="lg">
            {error && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{error}</div>
            )}
            {loading ? (
                <div className="flex items-center justify-center py-10">
                    <Loader2 className="w-6 h-6 text-[#06B6D4] animate-spin" />
                </div>
            ) : estimates.length === 0 ? (
                <EmptyState compact icon={GitCompare} title="No estimates to compare"
                    description="Once engineers estimate this module, their estimates appear here for comparison." />
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {estimates.map((e) => {
                        const eligible = canReview && e.status === 'Approved';
                        return (
                            <div key={e.id}
                                className={`rounded-xl border-2 p-4 ${e.isFinalApproved ? 'border-[#06B6D4] bg-[#ECFEFF]' : 'border-[#E2E8F0] bg-white'}`}>
                                <div className="flex items-center justify-between mb-3">
                                    <div className="font-semibold text-[#0F172A]">{e.engineerName}</div>
                                    {e.isFinalApproved && (
                                        <Badge variant="info" size="sm"><CheckCircle2 className="w-3 h-3 mr-1" />Final</Badge>
                                    )}
                                </div>
                                <dl className="space-y-1.5 text-sm">
                                    <div className="flex justify-between"><dt className="text-[#64748B]">Hours</dt><dd className="font-semibold text-[#0F172A]">{e.estimatedHours ?? '—'}</dd></div>
                                    <div className="flex justify-between"><dt className="text-[#64748B]">Test cases</dt><dd className="text-[#475569]">{e.testCaseCount ?? '—'}</dd></div>
                                    <div className="flex justify-between"><dt className="text-[#64748B]">Complexity</dt><dd className="text-[#475569]">{e.complexity ?? '—'}</dd></div>
                                    <div className="flex justify-between"><dt className="text-[#64748B]">Risk</dt><dd className="text-[#475569]">{e.riskLevel ?? '—'}</dd></div>
                                    <div className="flex justify-between"><dt className="text-[#64748B]">Status</dt><dd className="text-[#475569]">{e.status}</dd></div>
                                </dl>
                                {e.assumptions && <p className="text-xs text-[#94A3B8] mt-2 line-clamp-2">{e.assumptions}</p>}
                                {canReview && (
                                    <div className="mt-3">
                                        <Button
                                            size="sm"
                                            variant={e.isFinalApproved ? 'secondary' : 'primary'}
                                            disabled={!eligible || busyId === e.id}
                                            isLoading={busyId === e.id}
                                            onClick={() => handleSelect(e.id)}
                                            className="w-full"
                                        >
                                            {e.isFinalApproved ? 'Selected as final' : eligible ? 'Select as final' : 'Approve first to select'}
                                        </Button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </Modal>
    );
}
