'use client';

/**
 * BugEditModal — Modal-wrapped edit form lifted from the former `BugDetailDrawer`.
 *
 * Fields: title, description, severity, priority, status, assignee, module, environment,
 * current behavior, steps to reproduce, expected/actual result, impact, possible root cause,
 * suggested fix, preconditions. Saves through `bugService.updateBug` with change tracking.
 */
import { useState } from 'react';
import { Save, Plus } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/core';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { AutoResizeTextarea } from '@/components/ui/AutoResizeTextarea';
import { useToast } from '@/components/ui/Toast';
import { bugService } from '@/features/bug-management/services/bug.service';
import type { Bug, BugStatus, UpdateBugInput } from '../../types';
import {
    SEVERITIES, PRIORITIES, STATUSES, SEVERITY_COLOR, STATUS_COLOR,
} from '../bug-field-options';

const labelCls = 'block text-xs font-medium text-[#64748B] mb-1.5';
const inputCls = 'w-full h-10 px-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-sm text-[#1E293B] transition-all focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#06B6D4]/30 focus:border-[#06B6D4]';
const sectionTitleCls = 'flex items-center gap-2 pb-2 border-b border-[#F1F5F9] text-xs font-bold text-[#1E293B] uppercase tracking-wider';

interface Props {
    bug: Bug;
    onClose: () => void;
    onSaved: () => void;
}

export function BugEditModal({ bug, onClose, onSaved }: Props) {
    const toast = useToast();
    const [edits, setEdits] = useState<Partial<UpdateBugInput>>({});
    const [saving, setSaving] = useState(false);

    const handleEdit = (field: keyof UpdateBugInput, value: unknown) => {
        setEdits(prev => ({ ...prev, [field]: value }));
    };
    const hasEdit = (field: keyof UpdateBugInput) => edits[field] !== undefined;
    const getVal = (field: keyof Bug) => (hasEdit(field as keyof UpdateBugInput) ? (edits as unknown as Record<string, unknown>)[field] : (bug as unknown as Record<string, unknown>)[field]);

    const handleSave = async () => {
        if (Object.keys(edits).length === 0) { onClose(); return; }
        setSaving(true);
        const result = await bugService.updateBug(bug.id, { ...edits, changedBy: 'QA Team' });
        setSaving(false);
        if (result.success) {
            toast.success('Bug updated successfully.');
            onSaved();
        } else {
            toast.error(result.error || 'Failed to update bug.');
        }
    };

    const steps = (getVal('stepsToReproduce') as string[]) || [];
    const behaviors = (getVal('currentBehavior') as string[]) || [];
    const changedCount = Object.keys(edits).length;

    return (
        <Modal open onClose={() => !saving && onClose()} size="lg" title={`Edit ${bug.bugId}`}>
            <div className="space-y-6">
                {/* Summary */}
                <div className="space-y-4">
                    <div className={sectionTitleCls}>Summary</div>
                    <div>
                        <label className={labelCls}>Title</label>
                        <input value={(getVal('title') as string) || ''} onChange={e => handleEdit('title', e.target.value)}
                            className="w-full h-12 px-4 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm font-semibold text-[#1E293B] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#06B6D4]/30 focus:border-[#06B6D4]" />
                    </div>
                    <div>
                        <label className={labelCls}>Description</label>
                        <AutoResizeTextarea value={(getVal('description') as string) || ''} onChange={e => handleEdit('description', e.target.value)} minRows={3} maxRows={10}
                            className="w-full px-4 py-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm text-[#1E293B] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#06B6D4]/30 focus:border-[#06B6D4]" />
                    </div>
                </div>

                {/* Classification */}
                <div className="space-y-4">
                    <div className={sectionTitleCls}>Classification</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className={labelCls}>Severity</label>
                            <div className="flex gap-1.5">
                                {SEVERITIES.map(s => (
                                    <button key={s} onClick={() => handleEdit('severity', s)}
                                        className={`flex-1 h-10 rounded-lg text-xs font-medium transition-all ${getVal('severity') === s ? 'text-white shadow-sm' : 'bg-[#F8FAFC] text-[#64748B] border border-[#E2E8F0] hover:bg-[#F1F5F9]'}`}
                                        style={getVal('severity') === s ? { background: SEVERITY_COLOR[s] } : {}}>{s}</button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className={labelCls}>Priority</label>
                            <div className="flex gap-1.5">
                                {PRIORITIES.map(p => (
                                    <button key={p} onClick={() => handleEdit('priority', p)}
                                        className={`flex-1 h-10 rounded-lg text-xs font-medium transition-all ${getVal('priority') === p ? 'bg-[#0F172A] text-white shadow-sm' : 'bg-[#F8FAFC] text-[#64748B] border border-[#E2E8F0] hover:bg-[#F1F5F9]'}`}>{p}</button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className={labelCls}>Status</label>
                            <CustomSelect
                                options={STATUSES.map(s => ({ value: s, label: s, icon: <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLOR[s], flexShrink: 0 }} /> }))}
                                value={getVal('status') as BugStatus}
                                onChange={v => handleEdit('status', v)}
                                height={40}
                                accentColor={STATUS_COLOR[getVal('status') as BugStatus]}
                            />
                        </div>
                        <div>
                            <label className={labelCls}>Assignee</label>
                            <input value={(getVal('assignee') as string) || ''} onChange={e => handleEdit('assignee', e.target.value)} className={inputCls} />
                        </div>
                        <div>
                            <label className={labelCls}>Module</label>
                            <input value={(getVal('module') as string) || ''} onChange={e => handleEdit('module', e.target.value)} className={inputCls} />
                        </div>
                        <div>
                            <label className={labelCls}>Environment</label>
                            <input value={(getVal('environment') as string) || ''} onChange={e => handleEdit('environment', e.target.value)} className={inputCls} />
                        </div>
                    </div>
                </div>

                {/* Current Behavior */}
                <div className="space-y-3">
                    <div className={sectionTitleCls}>Current Behavior <span className="normal-case font-normal text-[#94A3B8] ml-1">(prefix with ✔️ or ❌)</span></div>
                    <div className="space-y-2">
                        {behaviors.map((item, i) => (
                            <div key={i} className="flex items-center gap-2">
                                <input value={item} onChange={e => { const a = [...behaviors]; a[i] = e.target.value; handleEdit('currentBehavior', a); }} className={inputCls} />
                                <button onClick={() => handleEdit('currentBehavior', behaviors.filter((_, idx) => idx !== i))} className="flex-shrink-0 w-8 h-8 rounded-lg text-[#94A3B8] hover:text-[#EF4444] hover:bg-[#EF4444]/10">✕</button>
                            </div>
                        ))}
                        <button onClick={() => handleEdit('currentBehavior', [...behaviors, '❌ '])} className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-medium text-[#06B6D4] hover:bg-[#06B6D4]/10"><Plus className="w-3.5 h-3.5" /> Add behavior item</button>
                    </div>
                </div>

                {/* Steps */}
                <div className="space-y-3">
                    <div className={sectionTitleCls}>Steps to Reproduce</div>
                    <div className="space-y-2">
                        {steps.map((step, i) => (
                            <div key={i} className="flex items-center gap-2">
                                <span className="flex-shrink-0 w-7 h-7 rounded-lg bg-[#0F172A] text-white flex items-center justify-center text-xs font-bold">{i + 1}</span>
                                <input value={step} onChange={e => { const a = [...steps]; a[i] = e.target.value; handleEdit('stepsToReproduce', a); }} className={inputCls} />
                                <button onClick={() => handleEdit('stepsToReproduce', steps.filter((_, idx) => idx !== i))} className="flex-shrink-0 w-8 h-8 rounded-lg text-[#94A3B8] hover:text-[#EF4444] hover:bg-[#EF4444]/10">✕</button>
                            </div>
                        ))}
                        <button onClick={() => handleEdit('stepsToReproduce', [...steps, ''])} className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-medium text-[#06B6D4] hover:bg-[#06B6D4]/10"><Plus className="w-3.5 h-3.5" /> Add step</button>
                    </div>
                </div>

                {/* Results & Impact */}
                <div className="space-y-4">
                    <div className={sectionTitleCls}>Results &amp; Impact</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className={labelCls}>Expected Result</label>
                            <AutoResizeTextarea value={(getVal('expectedResult') as string) || ''} onChange={e => handleEdit('expectedResult', e.target.value)} minRows={2} maxRows={8}
                                className="w-full px-4 py-3 rounded-xl border border-[#E2E8F0] bg-[#F0FDF4]/50 text-sm text-[#1E293B] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#22C55E]/30 focus:border-[#22C55E]" />
                        </div>
                        <div>
                            <label className={labelCls}>Actual Result</label>
                            <AutoResizeTextarea value={(getVal('actualResult') as string) || ''} onChange={e => handleEdit('actualResult', e.target.value)} minRows={2} maxRows={8}
                                className="w-full px-4 py-3 rounded-xl border border-[#E2E8F0] bg-[#FEF2F2]/50 text-sm text-[#1E293B] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#EF4444]/30 focus:border-[#EF4444]" />
                        </div>
                    </div>
                    <div>
                        <label className={labelCls}>Impact</label>
                        <AutoResizeTextarea value={(getVal('impact') as string) || ''} onChange={e => handleEdit('impact', e.target.value)} minRows={2} maxRows={6}
                            className="w-full px-4 py-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm text-[#1E293B] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#06B6D4]/30 focus:border-[#06B6D4]" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className={labelCls}>Possible Root Cause</label>
                            <AutoResizeTextarea value={(getVal('possibleRootCause') as string) || ''} onChange={e => handleEdit('possibleRootCause', e.target.value)} minRows={2} maxRows={6}
                                className="w-full px-4 py-3 rounded-xl border border-[#E2E8F0] bg-[#FFFBEB]/50 text-sm text-[#1E293B] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#F59E0B]/30 focus:border-[#F59E0B]" />
                        </div>
                        <div>
                            <label className={labelCls}>Suggested Fix</label>
                            <AutoResizeTextarea value={(getVal('suggestedFix') as string) || ''} onChange={e => handleEdit('suggestedFix', e.target.value)} minRows={2} maxRows={6}
                                className="w-full px-4 py-3 rounded-xl border border-[#E2E8F0] bg-[#EFF6FF]/50 text-sm text-[#1E293B] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/30 focus:border-[#3B82F6]" />
                        </div>
                    </div>
                    <div>
                        <label className={labelCls}>Preconditions</label>
                        <AutoResizeTextarea value={(getVal('precondition') as string) || ''} onChange={e => handleEdit('precondition', e.target.value)} minRows={2} maxRows={6}
                            className="w-full px-4 py-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm text-[#1E293B] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#06B6D4]/30 focus:border-[#06B6D4]" />
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="mt-6 pt-4 border-t border-[#E2E8F0] flex items-center justify-between">
                <span className="text-xs text-[#64748B]">{changedCount > 0 ? `${changedCount} field${changedCount > 1 ? 's' : ''} changed` : 'No changes yet'}</span>
                <div className="flex items-center gap-2">
                    <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
                    <Button variant="success" size="sm" onClick={handleSave} isLoading={saving} disabled={changedCount === 0}
                        leftIcon={!saving ? <Save className="w-4 h-4" /> : undefined}>
                        {saving ? 'Updating…' : 'Save Changes'}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
