'use client';

/**
 * Create-module modal for the estimation workspace.
 */

import { useState } from 'react';
import { Layers } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button, Input, TextArea, Label } from '@/components/core';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { estimationService } from '../services/estimation.service';
import type { ProjectVersion } from '../types';

interface Props {
    projectId: string;
    versions: ProjectVersion[];
    onClose: () => void;
    onSaved: () => void;
}

export function ModuleFormModal({ projectId, versions, onClose, onSaved }: Props) {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [versionId, setVersionId] = useState<string>('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!name.trim()) {
            setError('Module name is required');
            return;
        }
        setSubmitting(true);
        setError(null);
        const res = await estimationService.createModule(projectId, {
            name: name.trim(),
            description: description.trim() || undefined,
            versionId: versionId || undefined,
        });
        setSubmitting(false);
        if (res.success) {
            onSaved();
        } else {
            setError(res.error || 'Failed to create module');
        }
    }

    const versionOptions = [
        { value: '', label: 'Unversioned' },
        ...versions.map((v) => ({ value: v.id, label: v.name })),
    ];

    return (
        <Modal
            open
            onClose={onClose}
            icon={Layers}
            iconTone="cyan"
            title="Add Module"
            subtitle="Define a QA module to estimate"
            size="md"
            preventClose={submitting}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
                    <Button type="submit" form="est-module-form" isLoading={submitting}>Create Module</Button>
                </>
            }
        >
            <form id="est-module-form" onSubmit={handleSubmit} className="space-y-4">
                {error && (
                    <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
                )}
                <div>
                    <Label required>Module name</Label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Login" autoFocus />
                </div>
                <div>
                    <Label>Version / Release</Label>
                    <CustomSelect options={versionOptions} value={versionId} onChange={setVersionId} placeholder="Unversioned" />
                </div>
                <div>
                    <Label>Description</Label>
                    <TextArea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this module cover?" />
                </div>
            </form>
        </Modal>
    );
}
