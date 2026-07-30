'use client';

/**
 * ModuleProjectSelector — a module's own project dropdown, for its page header.
 *
 * Presentational: the owning page calls `useModuleProject(key)` and passes the selection down. This
 * replaces the old global `GlobalProjectSelector` that lived in the app header. Reuses `CustomSelect`
 * (portal-based — never clipped by the page's overflow containers).
 */

import { FolderKanban, Loader2 } from 'lucide-react';
import { CustomSelect, type SelectOption } from '@/components/ui/CustomSelect';
import type { Project } from '../types';

interface Props {
    projects: Project[];
    value: string | null;
    onChange: (projectName: string | null) => void;
    loading?: boolean;
}

export function ModuleProjectSelector({ projects, value, onChange, loading }: Props) {
    const options: SelectOption[] = projects.map((p) => ({
        value: p.projectName,
        label: `${p.projectName} · ${p.projectCode}`,
        icon: <FolderKanban style={{ width: 14, height: 14, color: '#06B6D4' }} />,
    }));

    return (
        <div className="flex items-center gap-2.5 min-w-[220px] max-w-[280px]">
            <FolderKanban className="w-4 h-4 text-[#06B6D4] flex-shrink-0" />
            {loading && projects.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-[#94A3B8]">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Loading…
                </div>
            ) : (
                <CustomSelect
                    options={options}
                    value={value ?? ''}
                    onChange={(v) => onChange(v || null)}
                    placeholder="Select project"
                    accentColor="#06B6D4"
                    height={36}
                />
            )}
        </div>
    );
}
