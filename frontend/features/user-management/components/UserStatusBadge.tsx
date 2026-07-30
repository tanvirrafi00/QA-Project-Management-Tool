/**
 * UserStatusBadge — fixed-color status pill for a user account, following the app's status-badge
 * pattern (a dot + label, palette per value). See `docs/ui-standards.md` §4/§6.
 */

import type { AccountStatus } from '@/features/auth/types';

const STATUS_STYLES: Record<AccountStatus, { dot: string; chip: string; label: string }> = {
    pending_approval: {
        dot: 'bg-[#F59E0B]',
        chip: 'bg-[#FFFBEB] text-[#B45309]',
        label: 'Pending Approval',
    },
    active: {
        dot: 'bg-[#10B981]',
        chip: 'bg-[#ECFDF5] text-[#047857]',
        label: 'Active',
    },
    rejected: {
        dot: 'bg-[#EF4444]',
        chip: 'bg-[#FEF2F2] text-[#DC2626]',
        label: 'Rejected',
    },
    suspended: {
        dot: 'bg-[#64748B]',
        chip: 'bg-[#F8FAFC] text-[#475569]',
        label: 'Suspended',
    },
    disabled: {
        dot: 'bg-[#94A3B8]',
        chip: 'bg-[#F1F5F9] text-[#64748B]',
        label: 'Disabled',
    },
};

export function UserStatusBadge({ status }: { status: AccountStatus }) {
    const style = STATUS_STYLES[status] ?? STATUS_STYLES.disabled;
    return (
        <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium ${style.chip}`}
        >
            <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
            {style.label}
        </span>
    );
}

/** Human-readable role label. */
export function roleLabel(role: string): string {
    switch (role) {
        case 'admin':
            return 'Admin';
        case 'qa_lead':
            return 'QA Lead';
        case 'qa_engineer':
            return 'QA Engineer';
        default:
            return role;
    }
}
