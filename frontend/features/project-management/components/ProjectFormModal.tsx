'use client';

/**
 * Project Form Modal — handles both Create and Edit.
 *
 * Create: name, code, description, type, status.
 * Edit:   name, description, type, status (code is read-only — it is used in identifiers).
 */

import { useState } from 'react';
import { FolderPlus, Pencil } from 'lucide-react';
import { Button } from '@/components/core';
import { CustomSelect, type SelectOption } from '@/components/ui/CustomSelect';
import { Modal } from '@/components/ui/Modal';
import { Alert } from '@/components/ui/Alert';
import {
    PROJECT_STATUSES,
    PROJECT_TYPES,
    Project,
    ProjectStatus,
    ProjectType,
} from '../types';
import { projectService } from '../services/project.service';

interface ProjectFormModalProps {
    /** When provided, the modal is in "edit" mode. */
    project?: Project | null;
    onClose: () => void;
    onSaved: (project: Project) => void;
}

const typeOptions: SelectOption[] = PROJECT_TYPES.map(t => ({ value: t, label: t }));
const statusOptions: SelectOption[] = PROJECT_STATUSES.map(s => ({ value: s, label: s }));

const inputClass =
    'w-full h-[42px] px-3 bg-white border-2 border-[#E2E8F0] rounded-[10px] text-sm font-medium text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#06B6D4] focus:ring-2 focus:ring-[#06B6D4]/10 transition-all box-border';

export function ProjectFormModal({ project, onClose, onSaved }: ProjectFormModalProps) {
    const isEdit = !!project;

    const [projectName, setProjectName] = useState(project?.projectName ?? '');
    const [projectCode, setProjectCode] = useState(project?.projectCode ?? '');
    const [description, setDescription] = useState(project?.description ?? '');
    const [projectType, setProjectType] = useState<ProjectType>(project?.projectType ?? 'Web Application');
    const [status, setStatus] = useState<ProjectStatus>(project?.status ?? 'Active');

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const normalizeCode = (raw: string) =>
        raw.trim().toUpperCase().replace(/\s+/g, '-').replace(/[^A-Z0-9-]/g, '');

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);

        if (!projectName.trim()) return setError('Project name is required');
        if (!isEdit && !projectCode.trim()) return setError('Project code is required');

        setSubmitting(true);
        try {
            if (isEdit && project) {
                const result = await projectService.updateProject(project.id, {
                    projectName: projectName.trim(),
                    description: description.trim(),
                    projectType,
                    status,
                });
                if (!result.success || !result.data) {
                    setError(result.error || 'Failed to update project');
                } else {
                    onSaved(result.data.project);
                }
            } else {
                const result = await projectService.createProject({
                    projectName: projectName.trim(),
                    projectCode: normalizeCode(projectCode),
                    description: description.trim(),
                    projectType,
                    status,
                });
                if (!result.success || !result.data) {
                    setError(result.error || 'Failed to create project');
                } else {
                    onSaved(result.data);
                }
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unexpected error occurred');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <Modal
            open
            onClose={onClose}
            preventClose={submitting}
            size="md"
            icon={isEdit ? Pencil : FolderPlus}
            iconTone="cyan"
            title={isEdit ? 'Edit Project' : 'Create New Project'}
            subtitle={isEdit ? 'Project code cannot be changed.' : 'Projects are the central hub for bugs & test cases.'}
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                {/* Project Name */}
                    <Field label="Project Name" required>
                        <input
                            type="text"
                            value={projectName}
                            onChange={e => setProjectName(e.target.value)}
                            placeholder="e.g. LOGE Admin"
                            className={inputClass}
                            autoFocus
                        />
                    </Field>

                    {/* Project Code */}
                    <Field
                        label="Project Code"
                        required
                        hint={isEdit ? 'Used in identifiers like LOGE-BUG-001 — not editable.' : 'Uppercase, used in LOGE-BUG-001.'}
                    >
                        <input
                            type="text"
                            value={projectCode}
                            onChange={e => setProjectCode(normalizeCode(e.target.value))}
                            placeholder="e.g. LOGE"
                            disabled={isEdit}
                            className={`${inputClass} font-mono disabled:bg-[#F8FAFC] disabled:text-[#94A3B8] disabled:cursor-not-allowed`}
                        />
                    </Field>

                    {/* Project Type */}
                    <Field label="Project Type" required>
                        <CustomSelect
                            options={typeOptions}
                            value={projectType}
                            onChange={v => setProjectType(v as ProjectType)}
                            accentColor="#06B6D4"
                        />
                    </Field>

                    {/* Status */}
                    <Field label="Status">
                        <CustomSelect
                            options={statusOptions}
                            value={status}
                            onChange={v => setStatus(v as ProjectStatus)}
                            accentColor="#06B6D4"
                        />
                    </Field>

                    {/* Description */}
                    <Field label="Description">
                        <textarea
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder="Short summary of the project…"
                            rows={3}
                            className={`${inputClass} h-auto py-2.5 resize-none leading-relaxed`}
                        />
                    </Field>

                    {/* Error (global inline Alert design) */}
                    {error && (
                        <Alert type="error" title={error} onDismiss={() => setError(null)} />
                    )}

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-3 pt-2">
                        <Button variant="secondary" size="sm" onClick={onClose} disabled={submitting}>
                            Cancel
                        </Button>
                        <Button type="submit" size="sm" disabled={submitting} isLoading={submitting}>
                            {submitting ? (isEdit ? 'Saving…' : 'Creating…') : isEdit ? 'Save Changes' : 'Create Project'}
                        </Button>
                    </div>
                </form>
        </Modal>
    );
}

function Field({
    label,
    required,
    hint,
    children,
}: {
    label: string;
    required?: boolean;
    hint?: string;
    children: React.ReactNode;
}) {
    return (
        <div>
            <label className="block text-xs font-semibold text-[#475569] mb-1.5">
                {label}
                {required && <span className="text-[#EF4444] ml-0.5">*</span>}
            </label>
            {children}
            {hint && <p className="text-[11px] text-[#94A3B8] mt-1">{hint}</p>}
        </div>
    );
}
