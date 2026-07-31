'use client';

/**
 * AddTestCaseDialog — Modal-wrapped quick-add form for test cases.
 * Fields mirror the table columns. Saves through `quickAddTestCase` service.
 */

import { useState, useEffect } from 'react';
import { Plus, Save, X } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/core';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { AutoResizeTextarea } from '@/components/ui/AutoResizeTextarea';
import { useToast } from '@/components/ui/Toast';
import { quickAddTestCase, type QuickAddTestCaseInput } from '../services/test-case-quick-add.service';
import type { TestCasePriority, TestCaseStatus, TestCaseType } from '../types';

const labelCls = 'block text-xs font-medium text-[#64748B] mb-1.5';
const inputCls = 'w-full h-10 px-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-sm text-[#1E293B] transition-all focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#06B6D4]/30 focus:border-[#06B6D4]';
const sectionTitleCls = 'flex items-center gap-2 pb-2 border-b border-[#F1F5F9] text-xs font-bold text-[#1E293B] uppercase tracking-wider';

interface Props {
    projectName: string;
    module: string;
    open: boolean;
    onClose: () => void;
    onSaved: () => void;
}

export function AddTestCaseDialog({ projectName, module, open, onClose, onSaved }: Props) {
    const toast = useToast();
    const [saving, setSaving] = useState(false);
    const [tcId, setTcId] = useState('');
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [type, setType] = useState<TestCaseType>('functional');
    const [priority, setPriority] = useState<TestCasePriority>('Medium');
    const [testSteps, setTestSteps] = useState<string[]>(['']);
    const [expectedResult, setExpectedResult] = useState('');
    const [testStatus, setTestStatus] = useState<TestCaseStatus>('Not Executed');
    const [actualResult, setActualResult] = useState('');
    const [assignedTo, setAssignedTo] = useState('');
    const [executionDate, setExecutionDate] = useState('');
    const [comments, setComments] = useState('');
    const [relatedBugs, setRelatedBugs] = useState<string[]>([]);
    const [tags, setTags] = useState<string[]>([]);

    const [errors, setErrors] = useState<Record<string, string>>({});

    // Reset form when modal opens
    useEffect(() => {
        if (open) {
            setTcId('');
            setName('');
            setDescription('');
            setType('functional');
            setPriority('Medium');
            setTestSteps(['']);
            setExpectedResult('');
            setTestStatus('Not Executed');
            setActualResult('');
            setAssignedTo('');
            setExecutionDate('');
            setComments('');
            setRelatedBugs([]);
            setTags([]);
            setErrors({});
        }
    }, [open]);

    const handleStepChange = (index: number, value: string) => {
        const newSteps = [...testSteps];
        newSteps[index] = value;
        setTestSteps(newSteps);
    };

    const addStep = () => {
        setTestSteps([...testSteps, '']);
    };

    const removeStep = (index: number) => {
        if (testSteps.length > 1) {
            const newSteps = testSteps.filter((_, i) => i !== index);
            setTestSteps(newSteps);
        }
    };

    const validate = (): boolean => {
        const newErrors: Record<string, string> = {};

        if (!name.trim()) {
            newErrors.name = 'Test case name is required';
        }
        if (!priority) {
            newErrors.priority = 'Priority is required';
        }
        if (testSteps.some(step => !step.trim())) {
            newErrors.testSteps = 'All test steps must be filled';
        }
        if (!expectedResult.trim()) {
            newErrors.expectedResult = 'Expected result is required';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();

        if (!validate()) {
            return;
        }

        setSaving(true);
        const input: QuickAddTestCaseInput = {
            projectName,
            module,
            tcId: tcId || undefined,
            name,
            description,
            type,
            priority,
            testSteps: testSteps.filter(s => s.trim()),
            expectedResult,
            testStatus,
            actualResult,
            assignedTo: assignedTo || undefined,
            executionDate: executionDate || undefined,
            comments,
            relatedBugs: relatedBugs.length > 0 ? relatedBugs : undefined,
            tags: tags.length > 0 ? tags : undefined,
        };

        const result = await quickAddTestCase(input);
        setSaving(false);

        if (result.success) {
            toast.success('Test case added successfully');
            onSaved();
            onClose();
        } else {
            toast.error(result.error || 'Failed to add test case');
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            handleSubmit();
        }
    };

    return (
        <Modal open={open} onClose={() => !saving && onClose()} size="lg" title="Add Test Case">
            <form onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
                <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
                    {/* Basic Info */}
                    <div className="space-y-4">
                        <div className={sectionTitleCls}>Basic Information</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className={labelCls}>TC ID <span className="text-[#EF4444]">*</span></label>
                                <input
                                    type="text"
                                    value={tcId}
                                    onChange={e => setTcId(e.target.value)}
                                    placeholder="Auto-generated if empty"
                                    className={inputCls}
                                />
                            </div>
                            <div>
                                <label className={labelCls}>Test Case Name <span className="text-[#EF4444]">*</span></label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    placeholder="Enter test case name"
                                    className={`${inputCls} ${errors.name ? 'border-[#EF4444]' : ''}`}
                                />
                                {errors.name && <p className="text-xs text-[#EF4444] mt-1">{errors.name}</p>}
                            </div>
                            <div>
                                <label className={labelCls}>Priority <span className="text-[#EF4444]">*</span></label>
                                <CustomSelect
                                    options={[
                                        { value: 'Critical', label: 'Critical' },
                                        { value: 'High', label: 'High' },
                                        { value: 'Medium', label: 'Medium' },
                                        { value: 'Low', label: 'Low' },
                                    ]}
                                    value={priority}
                                    onChange={(v) => setPriority(v as TestCasePriority)}
                                    height={40}
                                    accentColor="#EF4444"
                                />
                                {errors.priority && <p className="text-xs text-[#EF4444] mt-1">{errors.priority}</p>}
                            </div>
                            <div>
                                <label className={labelCls}>Type</label>
                                <CustomSelect
                                    options={[
                                        { value: 'functional', label: 'Functional' },
                                        { value: 'negative', label: 'Negative' },
                                        { value: 'edge', label: 'Edge Case' },
                                        { value: 'security', label: 'Security' },
                                        { value: 'boundary', label: 'Boundary' },
                                        { value: 'scenario', label: 'Scenario' },
                                    ]}
                                    value={type}
                                    onChange={(v) => setType(v as TestCaseType)}
                                    height={40}
                                    accentColor="#06B6D4"
                                />
                            </div>
                        </div>
                        <div>
                            <label className={labelCls}>Description</label>
                            <AutoResizeTextarea
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                minRows={2}
                                maxRows={6}
                                placeholder="Brief description of the test case"
                                className={inputCls}
                            />
                        </div>
                    </div>

                    {/* Test Steps */}
                    <div className="space-y-3">
                        <div className={sectionTitleCls}>Test Steps <span className="text-[#EF4444]">*</span></div>
                        <div className="space-y-2">
                            {testSteps.map((step, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <span className="flex-shrink-0 w-7 h-7 rounded-lg bg-[#0F172A] text-white flex items-center justify-center text-xs font-bold">
                                        {i + 1}
                                    </span>
                                    <input
                                        type="text"
                                        value={step}
                                        onChange={e => handleStepChange(i, e.target.value)}
                                        placeholder={`Step ${i + 1}`}
                                        className={`${inputCls} flex-1`}
                                    />
                                    {testSteps.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => removeStep(i)}
                                            className="flex-shrink-0 w-8 h-8 rounded-lg text-[#94A3B8] hover:text-[#EF4444] hover:bg-[#EF4444]/10"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            ))}
                            <button
                                type="button"
                                onClick={addStep}
                                className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-medium text-[#06B6D4] hover:bg-[#06B6D4]/10"
                            >
                                <Plus className="w-3.5 h-3.5" /> Add step
                            </button>
                            {errors.testSteps && <p className="text-xs text-[#EF4444] mt-1">{errors.testSteps}</p>}
                        </div>
                    </div>

                    {/* Results */}
                    <div className="space-y-4">
                        <div className={sectionTitleCls}>Results</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className={labelCls}>Expected Result <span className="text-[#EF4444]">*</span></label>
                                <AutoResizeTextarea
                                    value={expectedResult}
                                    onChange={e => setExpectedResult(e.target.value)}
                                    minRows={2}
                                    maxRows={8}
                                    placeholder="What should happen"
                                    className={`${inputCls} ${errors.expectedResult ? 'border-[#EF4444]' : ''}`}
                                />
                                {errors.expectedResult && <p className="text-xs text-[#EF4444] mt-1">{errors.expectedResult}</p>}
                            </div>
                            <div>
                                <label className={labelCls}>Actual Result</label>
                                <AutoResizeTextarea
                                    value={actualResult}
                                    onChange={e => setActualResult(e.target.value)}
                                    minRows={2}
                                    maxRows={8}
                                    placeholder="What actually happened"
                                    className={inputCls}
                                />
                            </div>
                        </div>
                        <div>
                            <label className={labelCls}>Test Status</label>
                            <CustomSelect
                                options={[
                                    { value: 'Not Executed', label: 'Not Executed' },
                                    { value: 'Passed', label: 'Passed' },
                                    { value: 'Failed', label: 'Failed' },
                                    { value: 'Blocked', label: 'Blocked' },
                                    { value: 'Skipped', label: 'Skipped' },
                                ]}
                                value={testStatus}
                                onChange={(v) => setTestStatus(v as TestCaseStatus)}
                                height={40}
                                accentColor="#06B6D4"
                            />
                        </div>
                    </div>

                    {/* Additional Info */}
                    <div className="space-y-4">
                        <div className={sectionTitleCls}>Additional Information</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className={labelCls}>Assigned To</label>
                                <input
                                    type="text"
                                    value={assignedTo}
                                    onChange={e => setAssignedTo(e.target.value)}
                                    placeholder="QA Engineer name"
                                    className={inputCls}
                                />
                            </div>
                            <div>
                                <label className={labelCls}>Execution Date</label>
                                <input
                                    type="date"
                                    value={executionDate}
                                    onChange={e => setExecutionDate(e.target.value)}
                                    className={inputCls}
                                />
                            </div>
                        </div>
                        <div>
                            <label className={labelCls}>Comments</label>
                            <AutoResizeTextarea
                                value={comments}
                                onChange={e => setComments(e.target.value)}
                                minRows={2}
                                maxRows={4}
                                placeholder="Additional notes"
                                className={inputCls}
                            />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className={labelCls}>Related Bugs</label>
                                <input
                                    type="text"
                                    value={relatedBugs.join(', ')}
                                    onChange={e => setRelatedBugs(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                                    placeholder="Comma-separated bug IDs"
                                    className={inputCls}
                                />
                            </div>
                            <div>
                                <label className={labelCls}>Tags</label>
                                <input
                                    type="text"
                                    value={tags.join(', ')}
                                    onChange={e => setTags(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                                    placeholder="Comma-separated tags"
                                    className={inputCls}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="mt-6 pt-4 border-t border-[#E2E8F0] flex items-center justify-between">
                    <span className="text-xs text-[#64748B]">
                        Press <kbd className="px-1.5 py-0.5 bg-[#F1F5F9] rounded text-[#64748B]">Ctrl/Cmd</kbd> + <kbd className="px-1.5 py-0.5 bg-[#F1F5F9] rounded text-[#64748B]">Enter</kbd> to save
                    </span>
                    <div className="flex items-center gap-2">
                        <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
                            Cancel
                        </Button>
                        <Button
                            variant="success"
                            size="sm"
                            onClick={handleSubmit}
                            isLoading={saving}
                            disabled={saving}
                            leftIcon={!saving ? <Save className="w-4 h-4" /> : undefined}
                        >
                            {saving ? 'Adding…' : 'Add Test Case'}
                        </Button>
                    </div>
                </div>
            </form>
        </Modal>
    );
}
