'use client';

/**
 * Create / edit estimation modal. An estimate is an engineer's take on a module
 * (hours, test-case count, complexity, risk, assumptions, dependencies, notes).
 *
 * Engineer identity: in auth-off / planning mode the engineer is identified by name; the id is derived
 * from the name so each named engineer is distinct for capacity/workload. (When real per-engineer
 * sessions land in Phase 2, engineerId becomes the logged-in user's id.)
 */

import { useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button, Input, TextArea, Label } from '@/components/core';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { estimationService } from '../services/estimation.service';
import type { ComplexityLevel, EstimationModule, ModuleEstimation, RiskLevel } from '../types';

interface Props {
    module: EstimationModule;
    /** When provided, the modal edits this estimate; otherwise it creates a new one. */
    estimation?: ModuleEstimation;
    /** Default engineer name (e.g. the logged-in user's name). */
    defaultEngineerName?: string;
    onClose: () => void;
    onSaved: () => void;
}

const COMPLEXITY_OPTIONS: { value: ComplexityLevel; label: string }[] = [
    { value: 'Low', label: 'Low (1 pt)' },
    { value: 'Medium', label: 'Medium (2 pts)' },
    { value: 'High', label: 'High (3 pts)' },
    { value: 'Critical', label: 'Critical (5 pts)' },
];
const RISK_OPTIONS: { value: RiskLevel; label: string }[] = [
    { value: 'Low', label: 'Low (1)' },
    { value: 'Medium', label: 'Medium (2)' },
    { value: 'High', label: 'High (3)' },
];

function slug(name: string): string {
    return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'engineer';
}

export function EstimationFormModal({ module, estimation, defaultEngineerName, onClose, onSaved }: Props) {
    const isEdit = !!estimation;
    const [engineerName, setEngineerName] = useState(estimation?.engineerName ?? defaultEngineerName ?? '');
    const [estimatedHours, setEstimatedHours] = useState(estimation?.estimatedHours?.toString() ?? '');
    const [testCaseCount, setTestCaseCount] = useState(estimation?.testCaseCount?.toString() ?? '');
    const [complexity, setComplexity] = useState<ComplexityLevel | ''>(estimation?.complexity ?? '');
    const [riskLevel, setRiskLevel] = useState<RiskLevel | ''>(estimation?.riskLevel ?? '');
    const [assumptions, setAssumptions] = useState(estimation?.assumptions ?? '');
    const [dependencies, setDependencies] = useState(estimation?.dependencies?.join(', ') ?? '');
    const [notes, setNotes] = useState(estimation?.notes ?? '');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!engineerName.trim()) {
            setError('Engineer name is required');
            return;
        }
        setSubmitting(true);
        setError(null);

        const deps = dependencies.split(',').map((d) => d.trim()).filter(Boolean);
        const common = {
            estimatedHours: estimatedHours === '' ? undefined : Number(estimatedHours),
            testCaseCount: testCaseCount === '' ? undefined : Number(testCaseCount),
            complexity: complexity || undefined,
            riskLevel: riskLevel || undefined,
            assumptions: assumptions.trim() || undefined,
            dependencies: deps,
            notes: notes.trim() || undefined,
        };

        const res = isEdit && estimation
            ? await estimationService.updateEstimation(estimation.id, common)
            : await estimationService.createEstimation(module.id, {
                  ...common,
                  engineerId: slug(engineerName),
                  engineerName: engineerName.trim(),
              });

        setSubmitting(false);
        if (res.success) {
            onSaved();
        } else {
            setError(res.error || 'Failed to save estimation');
        }
    }

    return (
        <Modal
            open
            onClose={onClose}
            icon={ClipboardList}
            iconTone="cyan"
            title={isEdit ? 'Edit Estimation' : 'Add Estimation'}
            subtitle={module.name}
            size="lg"
            preventClose={submitting}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
                    <Button type="submit" form="est-estimation-form" isLoading={submitting}>
                        {isEdit ? 'Save Changes' : 'Create Estimation'}
                    </Button>
                </>
            }
        >
            <form id="est-estimation-form" onSubmit={handleSubmit} className="space-y-4">
                {error && (
                    <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
                )}

                <div>
                    <Label required>Engineer</Label>
                    <Input
                        value={engineerName}
                        onChange={(e) => setEngineerName(e.target.value)}
                        placeholder="e.g. QA Engineer A"
                        disabled={isEdit}
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <Label>Estimated hours</Label>
                        <Input
                            type="number"
                            min="0"
                            step="0.5"
                            value={estimatedHours}
                            onChange={(e) => setEstimatedHours(e.target.value)}
                            placeholder="e.g. 20"
                        />
                    </div>
                    <div>
                        <Label>Estimated test cases</Label>
                        <Input
                            type="number"
                            min="0"
                            step="1"
                            value={testCaseCount}
                            onChange={(e) => setTestCaseCount(e.target.value)}
                            placeholder="e.g. 120"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <Label>Complexity</Label>
                        <CustomSelect
                            options={COMPLEXITY_OPTIONS}
                            value={complexity}
                            onChange={(v) => setComplexity(v as ComplexityLevel)}
                            placeholder="Select complexity"
                        />
                    </div>
                    <div>
                        <Label>Risk</Label>
                        <CustomSelect
                            options={RISK_OPTIONS}
                            value={riskLevel}
                            onChange={(v) => setRiskLevel(v as RiskLevel)}
                            placeholder="Select risk"
                        />
                    </div>
                </div>

                <div>
                    <Label>Assumptions</Label>
                    <TextArea value={assumptions} onChange={(e) => setAssumptions(e.target.value)} placeholder="e.g. API is ready" />
                </div>
                <div>
                    <Label>Dependencies</Label>
                    <Input value={dependencies} onChange={(e) => setDependencies(e.target.value)} placeholder="Comma-separated, e.g. Backend completion, Test data" />
                </div>
                <div>
                    <Label>Notes</Label>
                    <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Additional context" />
                </div>
            </form>
        </Modal>
    );
}
