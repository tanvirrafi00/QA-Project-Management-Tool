'use client';

/**
 * InlineAssigneeCell — searchable "Assigned To" dropdown for the Bug List.
 *
 * Options come from the project's members (QA Engineers + QA Leads — the assignable roles). Includes an
 * "Unassigned" option (value `''`) so a Lead/Admin can clear an assignment. The value is the member's
 * user id (uuid) — matching the backend `assignee`/`assigneeId` contract. If the current assignee is no
 * longer a project member, they are still shown as a selectable option so the cell never goes blank.
 */

import { InlineSelectCell } from './InlineSelectCell';
import type { SelectOption } from '@/components/ui/CustomSelect';
import type { ProjectMember } from '@/features/project-management/types';

interface InlineAssigneeCellProps {
    assigneeId: string;
    assigneeName: string;
    members: ProjectMember[];
    loading?: boolean;
    onChange: (assigneeId: string) => void;
}

/** Small avatar chip with the member's initial. */
function avatar(name: string, color: string): React.ReactNode {
    const initial = (name || '?').trim().charAt(0).toUpperCase();
    return (
        <span
            style={{
                width: 18,
                height: 18,
                borderRadius: '50%',
                background: `${color}1A`,
                color,
                fontSize: 10,
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
            }}
        >
            {initial}
        </span>
    );
}

const ASSIGNABLE_ROLES = new Set<ProjectMember['role']>(['qa_engineer', 'qa_lead']);

export function InlineAssigneeCell({
    assigneeId,
    assigneeName,
    members,
    loading = false,
    onChange,
}: InlineAssigneeCellProps) {
    const assignable = members.filter((m) => ASSIGNABLE_ROLES.has(m.role));

    const options: SelectOption[] = [
        { value: '', label: 'Unassigned', icon: avatar('?', '#94A3B8') },
        ...assignable.map((m) => ({
            value: m.id,
            label: m.name,
            icon: avatar(m.name, '#475569'),
        })),
    ];

    // If the current assignee isn't in the member list (e.g. removed), still show them as selectable.
    if (assigneeId && !assignable.some((m) => m.id === assigneeId)) {
        options.push({ value: assigneeId, label: assigneeName || 'Unknown', icon: avatar(assigneeName, '#475569') });
    }

    return (
        <InlineSelectCell
            value={assigneeId}
            options={options}
            onChange={onChange}
            accentColor="#475569"
            searchable
            loading={loading}
            placeholder="Assign…"
        />
    );
}
