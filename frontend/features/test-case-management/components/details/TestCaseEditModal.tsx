'use client';

/**
 * TestCaseEditModal — Modal-wrapped edit form lifted from the old drawer.
 *
 * Fields: name, module, priority, status, assigned-to, actual result, comments, related bugs
 * (comma-separated). Saves through `testCaseService.updateTestCase` with change tracking.
 * "Assign" reuses this modal (same fields) — no separate component needed.
 */
import { useEffect, useState } from 'react';
import { Pencil } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/core';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { AutoResizeTextarea } from '@/components/ui/AutoResizeTextarea';
import { useToast } from '@/components/ui/Toast';
import { testCaseService } from '@/features/test-case-management/services/test-case.service';
import type { TestCase, TestCaseStatus, TestCasePriority, UpdateTestCaseInput } from '@/features/test-case-management/types';
import { STATUS_OPTIONS, PRIORITY_OPTIONS, STATUS_COLOR, PRIORITY_COLOR } from './shared/constants';

const inputCls =
    'w-full h-10 px-3 rounded-xl border border-[#E2E8F0] text-sm text-[#1E293B] bg-white placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#06B6D4]/20 focus:border-[#06B6D4]';
const labelCls = 'text-xs font-semibold text-[#475569] mb-1.5 block';

export function TestCaseEditModal({
    testCase,
    onClose,
    onSaved,
}: {
    testCase: TestCase;
    onClose: () => void;
    onSaved: () => void;
}) {
    const toast = useToast();
    const [name, setName] = useState(testCase.name);
    const [module, setModule] = useState(testCase.module);
    const [priority, setPriority] = useState<TestCasePriority>(testCase.priority);
    const [status, setStatus] = useState<TestCaseStatus>(testCase.testStatus);
    const [assignedTo, setAssignedTo] = useState(testCase.assignedTo);
    const [actualResult, setActualResult] = useState(testCase.actualResult);
    const [comments, setComments] = useState(testCase.comments);
    const [relatedBugs, setRelatedBugs] = useState(testCase.relatedBugs.join(', '));
    const [saving, setSaving] = useState(false);

    // Re-seed local state when the underlying test case changes.
    useEffect(() => {
        setName(testCase.name);
        setModule(testCase.module);
        setPriority(testCase.priority);
        setStatus(testCase.testStatus);
        setAssignedTo(testCase.assignedTo);
        setActualResult(testCase.actualResult);
        setComments(testCase.comments);
        setRelatedBugs(testCase.relatedBugs.join(', '));
    }, [testCase]);

    const handleSave = async () => {
        setSaving(true);
        const updates: UpdateTestCaseInput = {
            name,
            module,
            priority,
            testStatus: status,
            assignedTo,
            actualResult,
            comments,
            relatedBugs: relatedBugs
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
            changedBy: 'QA Team',
        };
        const result = await testCaseService.updateTestCase(testCase.id, updates);
        setSaving(false);
        if (result.success) {
            toast.success('Test case updated.');
            onSaved();
        } else {
            toast.error(result.error || 'Failed to save changes.');
        }
    };

    return (
        <Modal
            open
            onClose={onClose}
            size="lg"
            icon={Pencil}
            iconTone="cyan"
            title="Edit Test Case"
            subtitle={testCase.tcId}
            preventClose={saving}
            footer={
                <>
                    <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
                        Cancel
                    </Button>
                    <Button variant="primary" size="sm" onClick={handleSave} disabled={saving} isLoading={saving}>
                        Save Changes
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <div>
                    <label className={labelCls}>Test Case Name</label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className={inputCls}
                        placeholder="Test case name"
                    />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className={labelCls}>Module</label>
                        <input
                            type="text"
                            value={module}
                            onChange={(e) => setModule(e.target.value)}
                            className={inputCls}
                            placeholder="Module"
                        />
                    </div>
                    <div>
                        <label className={labelCls}>Assigned To</label>
                        <input
                            type="text"
                            value={assignedTo}
                            onChange={(e) => setAssignedTo(e.target.value)}
                            className={inputCls}
                            placeholder="Assignee"
                        />
                    </div>
                    <div>
                        <label className={labelCls}>Status</label>
                        <CustomSelect
                            options={STATUS_OPTIONS.map((s) => ({
                                value: s,
                                label: s,
                                icon: (
                                    <span
                                        style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLOR[s], flexShrink: 0 }}
                                    />
                                ),
                            }))}
                            value={status}
                            onChange={(v) => setStatus(v as TestCaseStatus)}
                            height={40}
                            accentColor={STATUS_COLOR[status]}
                        />
                    </div>
                    <div>
                        <label className={labelCls}>Priority</label>
                        <CustomSelect
                            options={PRIORITY_OPTIONS.map((p) => ({
                                value: p,
                                label: p,
                                icon: (
                                    <span
                                        style={{ width: 8, height: 8, borderRadius: '50%', background: PRIORITY_COLOR[p], flexShrink: 0 }}
                                    />
                                ),
                            }))}
                            value={priority}
                            onChange={(v) => setPriority(v as TestCasePriority)}
                            height={40}
                            accentColor={PRIORITY_COLOR[priority]}
                        />
                    </div>
                </div>

                <div>
                    <label className={labelCls}>Related Bugs</label>
                    <input
                        type="text"
                        value={relatedBugs}
                        onChange={(e) => setRelatedBugs(e.target.value)}
                        className={inputCls}
                        placeholder="BUG-001, BUG-002"
                    />
                </div>

                <div>
                    <label className={labelCls}>Actual Result</label>
                    <AutoResizeTextarea
                        value={actualResult}
                        onChange={(e) => setActualResult(e.target.value)}
                        placeholder="Record the actual outcome…"
                        minRows={3}
                        className="w-full rounded-xl border border-[#E2E8F0] p-3 text-sm text-[#1E293B] focus:outline-none focus:ring-2 focus:ring-[#06B6D4]/20 focus:border-[#06B6D4]"
                    />
                </div>

                <div>
                    <label className={labelCls}>Comments</label>
                    <AutoResizeTextarea
                        value={comments}
                        onChange={(e) => setComments(e.target.value)}
                        placeholder="Add execution or review notes…"
                        minRows={3}
                        className="w-full rounded-xl border border-[#E2E8F0] p-3 text-sm text-[#1E293B] focus:outline-none focus:ring-2 focus:ring-[#06B6D4]/20 focus:border-[#06B6D4]"
                    />
                </div>
            </div>
        </Modal>
    );
}
