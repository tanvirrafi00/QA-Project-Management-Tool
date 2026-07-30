/**
 * Centralized Empty-State Library
 * =============================================================================
 * One source of truth for every "no data" UI in the app. Each preset is a thin
 * wrapper around the generic `EmptyState` (`components/ui/EmptyState.tsx`),
 * pre-configured with the right icon / title / description / CTA per the
 * Empty State & No-Data Handling Standard.
 *
 * Usage:
 *   import { EmptyProjects, EmptyBugs, EmptyTable, EmptyChart } from '@/components/states';
 *
 * Why one module instead of N files? Every preset is a 3-line wrapper; co-locating
 * them keeps the copy/design tokens consistent and avoids drift. The generic
 * `EmptyState` remains the only place that owns layout + styling.
 */

import { ReactNode } from 'react';
import {
    Inbox, BarChart3, Search, ChevronDown, FolderKanban, Bug as BugIcon,
    ClipboardList, FileBarChart, Users, LayoutDashboard,
    LucideIcon,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';

/* -------------------------------------------------------------------------- */
/* Generic structural presets                                                 */
/* -------------------------------------------------------------------------- */

/** Inside a data table when there are zero rows (no filters applied). */
export function EmptyTable({
    title = 'No records found.',
    description = 'Records will appear here once they are created.',
    colSpan = 1,
}: {
    title?: string;
    description?: string;
    /** Number of columns to span so the empty row matches the table width. */
    colSpan?: number;
}) {
    return (
        <tr>
            <td colSpan={colSpan} className="py-2">
                <EmptyState
                    icon={Inbox}
                    title={title}
                    description={description}
                    compact
                />
            </td>
        </tr>
    );
}

/** Inside a chart card when the dataset is empty. Keeps the card height intact. */
export function EmptyChart({
    title = 'No Data Available',
    description = 'Data will appear here once records are created.',
    icon = BarChart3,
}: {
    title?: string;
    description?: string;
    icon?: LucideIcon;
}) {
    return (
        <EmptyState
            icon={icon}
            title={title}
            description={description}
            compact
        />
    );
}

/** When a search returns nothing. */
export function EmptySearch({
    searchTerm,
    onClear,
}: {
    searchTerm?: string;
    onClear?: () => void;
}) {
    return (
        <EmptyState
            icon={Search}
            title={searchTerm ? `No results found for "${searchTerm}"` : 'No matching records found.'}
            description="Try adjusting your search or filters to find what you're looking for."
            action={onClear ? { label: 'Clear Filters', onClick: onClear, variant: 'secondary' } : undefined}
            compact
        />
    );
}

/** Inside a dropdown/select when there are no options. */
export function EmptyDropdown({
    label = 'No options available',
}: {
    label?: string;
}) {
    return (
        <div className="flex items-center gap-2 px-3 py-2.5 text-sm text-[#94A3B8]">
            <ChevronDown className="w-3.5 h-3.5" />
            {label}
        </div>
    );
}

/* -------------------------------------------------------------------------- */
/* Module-specific presets                                                     */
/* -------------------------------------------------------------------------- */

export function EmptyProjects({
    onCreate,
    actionNode,
}: {
    onCreate?: () => void;
    actionNode?: ReactNode;
}) {
    return (
        <EmptyState
            icon={FolderKanban}
            title="No Projects Found"
            description="Create your first project to start managing test cases and bugs."
            action={onCreate ? { label: 'Create Project', onClick: onCreate } : undefined}
            actionNode={actionNode}
        />
    );
}

export function EmptyBugs({
    onCreate,
    actionNode,
}: {
    onCreate?: () => void;
    actionNode?: ReactNode;
}) {
    return (
        <EmptyState
            icon={BugIcon}
            title="No Bugs Reported"
            description="Reported bugs will appear here."
            action={onCreate ? { label: 'Create Bug', onClick: onCreate } : undefined}
            actionNode={actionNode}
        />
    );
}

export function EmptyTestCases({
    onGenerate,
    actionNode,
}: {
    onGenerate?: () => void;
    actionNode?: ReactNode;
}) {
    return (
        <EmptyState
            icon={ClipboardList}
            title="No Test Cases Available"
            description="Generate or create test cases to begin test management."
            action={onGenerate ? { label: 'Generate Test Cases', onClick: onGenerate } : undefined}
            actionNode={actionNode}
        />
    );
}

export function EmptyReports() {
    return (
        <EmptyState
            icon={FileBarChart}
            title="No Reports Available"
            description="Reports will be generated as project data becomes available."
        />
    );
}

export function EmptyUsers() {
    return (
        <EmptyState
            icon={Users}
            title="No Users Found"
            description="Approved users will appear here."
        />
    );
}

/** Dashboard-wide first-run state (zero projects / bugs / test cases). */
export function EmptyDashboard({
    onCreateProject,
    actionNode,
}: {
    onCreateProject?: () => void;
    actionNode?: ReactNode;
}) {
    return (
        <EmptyState
            icon={LayoutDashboard}
            title="Welcome to AI QA Copilot"
            description="Your dashboard is empty. Create a project to start generating test cases and bug reports."
            action={onCreateProject ? { label: 'Create Your First Project', onClick: onCreateProject } : undefined}
            actionNode={actionNode}
        />
    );
}

export { EmptyState };
