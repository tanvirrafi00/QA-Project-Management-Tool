'use client';

/**
 * AddBugDialog — Modal-wrapped quick-add form for bugs.
 * Fields mirror the table columns. Saves through `quickAddBug` service.
 */

import { useState, useEffect } from 'react';
import { Plus, Save, X } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/core';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { AutoResizeTextarea } from '@/components/ui/AutoResizeTextarea';
import { useToast } from '@/components/ui/Toast';
import { quickAddBug, type QuickAddBugInput } from '../services/bug-quick-add.service';
import type { BugSeverity, BugPriority, BugStatus, BugLayer } from '../types';

const labelCls = 'block text-xs font-medium text-[#64748B] mb-1.5';
const inputCls = 'w-full h-10 px-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-sm text-[#1E293B] transition-all focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#06B6D4]/30 focus:border-[#06B6D4]';
const sectionTitleCls = 'flex items-center gap-2 pb-2 border-b border-[#F1F5F9] text-xs font-bold text-[#1E293B] uppercase tracking-wider';

interface Props {
    projectName: string;
    module?: string;
    open: boolean;
    onClose: () => void;
    onSaved: () => void;
}

export function AddBugDialog({ projectName, module = '', open, onClose, onSaved }: Props) {
    const toast = useToast();
    const [saving, setSaving] = useState(false);
    const [bugId, setBugId] = useState('');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [severity, setSeverity] = useState<BugSeverity>('Medium');
    const [priority, setPriority] = useState<BugPriority>('P3');
    const [status, setStatus] = useState<BugStatus>('Open');
    const [layer, setLayer] = useState<BugLayer>('Frontend');
    const [environment, setEnvironment] = useState('');
    const [precondition, setPrecondition] = useState('');
    const [currentBehavior, setCurrentBehavior] = useState<string[]>(['']);
    const [stepsToReproduce, setStepsToReproduce] = useState<string[]>(['']);
    const [expectedResult, setExpectedResult] = useState('');
    const [actualResult, setActualResult] = useState('');
    const [impact, setImpact] = useState('');
    const [assignee, setAssignee] = useState('');
    const [possibleRootCause, setPossibleRootCause] = useState('');
    const [suggestedFix, setSuggestedFix] = useState('');
    const [similarBugs, setSimilarBugs] = useState<string[]>([]);
    const [missingInfo, setMissingInfo] = useState<string[]>([]);
    const [tags, setTags] = useState<string[]>([]);

    const [errors, setErrors] = useState<Record<string, string>>({});

    // Reset form when modal opens
    useEffect(() => {
        if (open) {
            setBugId('');
            setTitle('');
            setDescription('');
            setSeverity('Medium');
            setPriority('P3');
            setStatus('Open');
            setLayer('Frontend');
            setEnvironment('');
            setPrecondition('');
            setCurrentBehavior(['']);
            setStepsToReproduce(['']);
            setExpectedResult('');
            setActualResult('');
            setImpact('');
            setAssignee('');
            setPossibleRootCause('');
            setSuggestedFix('');
            setSimilarBugs([]);
            setMissingInfo([]);
            setTags([]);
            setErrors({});
        }
    }, [open]);

    const handleBehaviorChange = (index: number, value: string) => {
        const newBehaviors = [...currentBehavior];
        newBehaviors[index] = value;
        setCurrentBehavior(newBehaviors);
    };

    const addBehavior = () => {
        setCurrentBehavior([...currentBehavior, '']);
    };

    const removeBehavior = (index: number) => {
        if (currentBehavior.length > 1) {
            const newBehaviors = currentBehavior.filter((_, i) => i !== index);
            setCurrentBehavior(newBehaviors);
        }
    };

    const handleStepChange = (index: number, value: string) => {
        const newSteps = [...stepsToReproduce];
        newSteps[index] = value;
        setStepsToReproduce(newSteps);
    };

    const addStep = () => {
        setStepsToReproduce([...stepsToReproduce, '']);
    };

    const removeStep = (index: number) => {
        if (stepsToReproduce.length > 1) {
            const newSteps = stepsToReproduce.filter((_, i) => i !== index);
            setStepsToReproduce(newSteps);
        }
    };

    const validate = (): boolean => {
        const newErrors: Record<string, string> = {};

        if (!title.trim()) {
            newErrors.title = 'Bug title is required';
        }
        if (!severity) {
            newErrors.severity = 'Severity is required';
        }
        if (!priority) {
            newErrors.priority = 'Priority is required';
        }
        if (!description.trim()) {
            newErrors.description = 'Description is required';
        }
        if (stepsToReproduce.some(step => !step.trim())) {
            newErrors.stepsToReproduce = 'All steps to reproduce must be filled';
        }
        if (!expectedResult.trim()) {
            newErrors.expectedResult = 'Expected result is required';
        }
        if (!actualResult.trim()) {
            newErrors.actualResult = 'Actual result is required';
        }
        if (!status) {
            newErrors.status = 'Status is required';
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
        const input: QuickAddBugInput = {
            projectName,
            module,
            bugId: bugId || undefined,
            title,
            description,
            severity,
            priority,
            status,
            layer,
            environment,
            precondition,
            currentBehavior,
            stepsToReproduce: stepsToReproduce.filter(s => s.trim()),
            expectedResult,
            actualResult,
            impact,
            assignee,
            possibleRootCause,
            suggestedFix,
            similarBugs: similarBugs.length > 0 ? similarBugs : undefined,
            missingInfo: missingInfo.length > 0 ? missingInfo : undefined,
            tags: tags.length > 0 ? tags : undefined,
        };

        const result = await quickAddBug(input);
        setSaving(false);

        if (result.success) {
            toast.success('Bug added successfully');
            onSaved();
            onClose();
        } else {
            toast.error(result.error || 'Failed to add bug');
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            handleSubmit();
        }
    };

    return (
        <Modal open={open} onClose={() => !saving && onClose()} size="lg" title="Add Bug">
            <form onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
                <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
                    {/* Summary */}
                    <div className="space-y-4">
                        <div className={sectionTitleCls}>Summary</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className={labelCls}>Bug ID <span className="text-[#EF4444]">*</span></label>
                                <input
                                    type="text"
                                    value={bugId}
                                    onChange={e => setBugId(e.target.value)}
                                    placeholder="Auto-generated if empty"
                                    className={inputCls}
                                />
                            </div>
                            <div>
                                <label className={labelCls}>Title <span className="text-[#EF4444]">*</span></label>
                                <input
                                    type="text"
                                    value={title}
                                    onChange={e => setTitle(e.target.value)}
                                    placeholder="Brief bug title"
                                    className={`${inputCls} ${errors.title ? 'border-[#EF4444]' : ''}`}
                                />
                                {errors.title && <p className="text-xs text-[#EF4444] mt-1">{errors.title}</p>}
                            </div>
                        </div>
                        <div>
                            <label className={labelCls}>Description <span className="text-[#EF4444]">*</span></label>
                            <AutoResizeTextarea
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                minRows={3}
                                maxRows={8}
                                placeholder="Detailed bug description"
                                className={`${inputCls} ${errors.description ? 'border-[#EF4444]' : ''}`}
                            />
                            {errors.description && <p className="text-xs text-[#EF4444] mt-1">{errors.description}</p>}
                        </div>
                    </div>

                    {/* Classification */}
                    <div className="space-y-4">
                        <div className={sectionTitleCls}>Classification</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className={labelCls}>Severity <span className="text-[#EF4444]">*</span></label>
                                <CustomSelect
                                    options={[
                                        { value: 'Critical', label: 'Critical' },
                                        { value: 'High', label: 'High' },
                                        { value: 'Medium', label: 'Medium' },
                                        { value: 'Low', label: 'Low' },
                                    ]}
                                    value={severity}
                                    onChange={(v) => setSeverity(v as BugSeverity)}
                                    height={40}
                                    accentColor="#EF4444"
                                />
                                {errors.severity && <p className="text-xs text-[#EF4444] mt-1">{errors.severity}</p>}
                            </div>
                            <div>
                                <label className={labelCls}>Priority <span className="text-[#EF4444]">*</span></label>
                                <CustomSelect
                                    options={[
                                        { value: 'P1', label: 'P1' },
                                        { value: 'P2', label: 'P2' },
                                        { value: 'P3', label: 'P3' },
                                        { value: 'P4', label: 'P4' },
                                    ]}
                                    value={priority}
                                    onChange={(v) => setPriority(v as BugPriority)}
                                    height={40}
                                    accentColor="#EF4444"
                                />
                                {errors.priority && <p className="text-xs text-[#EF4444] mt-1">{errors.priority}</p>}
                            </div>
                            <div>
                                <label className={labelCls}>Status <span className="text-[#EF4444]">*</span></label>
                                <CustomSelect
                                    options={[
                                        { value: 'Open', label: 'Open' },
                                        { value: 'Assigned', label: 'Assigned' },
                                        { value: 'In Progress', label: 'In Progress' },
                                        { value: 'Fixed', label: 'Fixed' },
                                        { value: 'Ready For QA', label: 'Ready For QA' },
                                        { value: 'Verified', label: 'Verified' },
                                        { value: 'Closed', label: 'Closed' },
                                        { value: 'Reopened', label: 'Reopened' },
                                    ]}
                                    value={status}
                                    onChange={(v) => setStatus(v as BugStatus)}
                                    height={40}
                                    accentColor="#06B6D4"
                                />
                                {errors.status && <p className="text-xs text-[#EF4444] mt-1">{errors.status}</p>}
                            </div>
                            <div>
                                <label className={labelCls}>Layer</label>
                                <CustomSelect
                                    options={[
                                        { value: 'Frontend', label: 'Frontend' },
                                        { value: 'Backend', label: 'Backend' },
                                        { value: 'Integration', label: 'Integration' },
                                        { value: 'Mobile', label: 'Mobile' },
                                        { value: 'Infrastructure', label: 'Infrastructure' },
                                    ]}
                                    value={layer}
                                    onChange={(v) => setLayer(v as BugLayer)}
                                    height={40}
                                    accentColor="#06B6D4"
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className={labelCls}>Assignee</label>
                                <input
                                    type="text"
                                    value={assignee}
                                    onChange={e => setAssignee(e.target.value)}
                                    placeholder="QA Engineer name"
                                    className={inputCls}
                                />
                            </div>
                            <div>
                                <label className={labelCls}>Environment</label>
                                <input
                                    type="text"
                                    value={environment}
                                    onChange={e => setEnvironment(e.target.value)}
                                    placeholder="Browser, OS, etc."
                                    className={inputCls}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Current Behavior */}
                    <div className="space-y-3">
                        <div className={sectionTitleCls}>Current Behavior <span className="normal-case font-normal text-[#94A3B8] ml-1">(prefix with ✔️ or ❌)</span></div>
                        <div className="space-y-2">
                            {currentBehavior.map((item, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={item}
                                        onChange={e => handleBehaviorChange(i, e.target.value)}
                                        placeholder={`Behavior ${i + 1}`}
                                        className={inputCls}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => removeBehavior(i)}
                                        className="flex-shrink-0 w-8 h-8 rounded-lg text-[#94A3B8] hover:text-[#EF4444] hover:bg-[#EF4444]/10"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                            <button
                                type="button"
                                onClick={addBehavior}
                                className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-medium text-[#06B6D4] hover:bg-[#06B6D4]/10"
                            >
                                <Plus className="w-3.5 h-3.5" /> Add behavior item
                            </button>
                        </div>
                    </div>

                    {/* Steps */}
                    <div className="space-y-3">
                        <div className={sectionTitleCls}>Steps to Reproduce <span className="text-[#EF4444]">*</span></div>
                        <div className="space-y-2">
                            {stepsToReproduce.map((step, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <span className="flex-shrink-0 w-7 h-7 rounded-lg bg-[#0F172A] text-white flex items-center justify-center text-xs font-bold">{i + 1}</span>
                                    <input
                                        type="text"
                                        value={step}
                                        onChange={e => handleStepChange(i, e.target.value)}
                                        placeholder={`Step ${i + 1}`}
                                        className={inputCls}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => removeStep(i)}
                                        className="flex-shrink-0 w-8 h-8 rounded-lg text-[#94A3B8] hover:text-[#EF4444] hover:bg-[#EF4444]/10"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                            <button
                                type="button"
                                onClick={addStep}
                                className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-medium text-[#06B6D4] hover:bg-[#06B6D4]/10"
                            >
                                <Plus className="w-3.5 h-3.5" /> Add step
                            </button>
                            {errors.stepsToReproduce && <p className="text-xs text-[#EF4444] mt-1">{errors.stepsToReproduce}</p>}
                        </div>
                    </div>

                    {/* Results & Impact */}
                    <div className="space-y-4">
                        <div className={sectionTitleCls}>Results & Impact</div>
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
                                <label className={labelCls}>Actual Result <span className="text-[#EF4444]">*</span></label>
                                <AutoResizeTextarea
                                    value={actualResult}
                                    onChange={e => setActualResult(e.target.value)}
                                    minRows={2}
                                    maxRows={8}
                                    placeholder="What actually happened"
                                    className={`${inputCls} ${errors.actualResult ? 'border-[#EF4444]' : ''}`}
                                />
                                {errors.actualResult && <p className="text-xs text-[#EF4444] mt-1">{errors.actualResult}</p>}
                            </div>
                        </div>
                        <div>
                            <label className={labelCls}>Impact</label>
                            <AutoResizeTextarea
                                value={impact}
                                onChange={e => setImpact(e.target.value)}
                                minRows={2}
                                maxRows={6}
                                placeholder="Impact of the bug"
                                className={inputCls}
                            />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className={labelCls}>Possible Root Cause</label>
                                <AutoResizeTextarea
                                    value={possibleRootCause}
                                    onChange={e => setPossibleRootCause(e.target.value)}
                                    minRows={2}
                                    maxRows={6}
                                    placeholder="Hypothesis"
                                    className={inputCls}
                                />
                            </div>
                            <div>
                                <label className={labelCls}>Suggested Fix</label>
                                <AutoResizeTextarea
                                    value={suggestedFix}
                                    onChange={e => setSuggestedFix(e.target.value)}
                                    minRows={2}
                                    maxRows={6}
                                    placeholder="Proposed solution"
                                    className={inputCls}
                                />
                            </div>
                        </div>
                        <div>
                            <label className={labelCls}>Preconditions</label>
                            <AutoResizeTextarea
                                value={precondition}
                                onChange={e => setPrecondition(e.target.value)}
                                minRows={2}
                                maxRows={6}
                                placeholder="Setup required"
                                className={inputCls}
                            />
                        </div>
                    </div>

                    {/* Additional Info */}
                    <div className="space-y-4">
                        <div className={sectionTitleCls}>Additional Information</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className={labelCls}>Related Bugs</label>
                                <input
                                    type="text"
                                    value={similarBugs.join(', ')}
                                    onChange={e => setSimilarBugs(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                                    placeholder="Comma-separated bug IDs"
                                    className={inputCls}
                                />
                            </div>
                            <div>
                                <label className={labelCls}>Missing Info</label>
                                <input
                                    type="text"
                                    value={missingInfo.join(', ')}
                                    onChange={e => setMissingInfo(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                                    placeholder="Comma-separated missing info"
                                    className={inputCls}
                                />
                            </div>
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
                            {saving ? 'Adding…' : 'Add Bug'}
                        </Button>
                    </div>
                </div>
            </form>
        </Modal>
    );
}
