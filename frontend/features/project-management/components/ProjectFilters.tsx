'use client';

import { Search } from 'lucide-react';
import { CustomSelect, type SelectOption } from '@/components/ui/CustomSelect';
import { PROJECT_STATUSES, PROJECT_TYPES, ProjectFilter, ProjectStatus, ProjectType } from '../types';

interface ProjectFiltersProps {
    filter: ProjectFilter;
    onFilterChange: (filter: ProjectFilter) => void;
}

const statusOptions: SelectOption[] = [
    { value: '', label: 'All Statuses' },
    ...PROJECT_STATUSES.map(s => ({ value: s, label: s })),
];

const typeOptions: SelectOption[] = [
    { value: '', label: 'All Types' },
    ...PROJECT_TYPES.map(t => ({ value: t, label: t })),
];

export function ProjectFilters({ filter, onFilterChange }: ProjectFiltersProps) {
    return (
        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-4 flex items-center gap-3 flex-wrap">
            {/* Search */}
            <div className="relative flex-1 min-w-[220px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
                <input
                    type="text"
                    value={filter.search ?? ''}
                    onChange={e => onFilterChange({ ...filter, search: e.target.value })}
                    placeholder="Search by project name or code…"
                    className="w-full pl-9 pr-4 h-10 rounded-xl border border-[#E2E8F0] text-sm text-[#1E293B] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#06B6D4]/20 focus:border-[#06B6D4]"
                />
            </div>

            {/* Status */}
            <div className="flex items-center gap-2">
                <span className="text-xs text-[#94A3B8] font-medium whitespace-nowrap">Status:</span>
                <div style={{ width: '150px' }}>
                    <CustomSelect
                        options={statusOptions}
                        value={filter.status ?? ''}
                        onChange={v =>
                            onFilterChange({ ...filter, status: (v || undefined) as ProjectStatus | undefined })
                        }
                        height={38}
                        accentColor="#06B6D4"
                    />
                </div>
            </div>

            {/* Type */}
            <div className="flex items-center gap-2">
                <span className="text-xs text-[#94A3B8] font-medium whitespace-nowrap">Type:</span>
                <div style={{ width: '180px' }}>
                    <CustomSelect
                        options={typeOptions}
                        value={filter.projectType ?? ''}
                        onChange={v =>
                            onFilterChange({ ...filter, projectType: (v || undefined) as ProjectType | undefined })
                        }
                        height={38}
                        accentColor="#06B6D4"
                    />
                </div>
            </div>
        </div>
    );
}
