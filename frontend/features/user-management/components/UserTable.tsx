/**
 * UserTable — the admin user list table. Columns: Name · Email · Registration Date · Status · Actions.
 * Row click opens the details drawer; per-row action buttons are status-aware and stop propagation.
 * Wraps in the standard card surface; the page passes the already-paginated slice and renders the
 * shared `Pagination` footer.
 */

import { Eye, Check, X } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { UserStatusBadge, roleLabel } from './UserStatusBadge';
import type { UserAccount } from '../types';

/** A clickable icon action inside a row. */
function ActionButton({
    title,
    icon: Icon,
    onClick,
    tone = 'neutral',
}: {
    title: string;
    icon: typeof Eye;
    onClick: (e: React.MouseEvent) => void;
    tone?: 'neutral' | 'success' | 'danger' | 'primary';
}) {
    const toneClass = {
        neutral: 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9]',
        success: 'text-[#10B981] hover:bg-[#ECFDF5]',
        danger: 'text-[#EF4444] hover:bg-[#FEF2F2]',
        primary: 'text-[#06B6D4] hover:bg-[#ECFEFF]',
    }[tone];

    return (
        <button
            type="button"
            title={title}
            aria-label={title}
            onClick={onClick}
            className={`inline-flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-xs font-medium transition-colors ${toneClass}`}
        >
            <Icon className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">{title}</span>
        </button>
    );
}

/** PG timestamptz strings arrive with a space separator; normalize so Safari/older engines parse it. */
function formatDate(value: string | null): string {
    if (!value) return '—';
    const d = new Date(String(value).replace(' ', 'T'));
    return Number.isNaN(d.getTime())
        ? '—'
        : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export interface UserTableProps {
    users: UserAccount[];
    loading?: boolean;
    /** Optional footer slot (the page renders the shared `Pagination` here). */
    footer?: React.ReactNode;
    onView: (user: UserAccount) => void;
    onApprove: (user: UserAccount) => void;
    onReject: (user: UserAccount) => void;
}

export function UserTable({
    users,
    loading,
    footer,
    onView,
    onApprove,
    onReject,
}: UserTableProps) {
    if (!loading && users.length === 0) {
        return (
            <div className="bg-white rounded-2xl border border-[#E2E8F0] overflow-hidden">
                <EmptyState
                    icon={Eye}
                    title="No users in this view"
                    description="There are no users with this status right now."
                    compact
                />
            </div>
        );
    }

    return (
        <div className="bg-white rounded-2xl border border-[#E2E8F0] overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-[#F8FAFC] text-left">
                            <th className="px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wider">Name</th>
                            <th className="px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wider">Email</th>
                            <th className="px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wider">Requested Role</th>
                            <th className="px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wider">Registration Date</th>
                            <th className="px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wider">Status</th>
                            <th className="px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wider text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map((user) => (
                            <tr
                                key={user.id}
                                onClick={() => onView(user)}
                                className="border-b border-[#F1F5F9] last:border-0 hover:bg-[#F8FAFC] cursor-pointer transition-colors"
                            >
                                <td className="px-4 py-2.5">
                                    <div className="font-semibold text-[#0F172A] truncate max-w-[220px]" title={user.name}>{user.name}</div>
                                </td>
                                <td className="px-4 py-2.5 text-[#475569]">
                                    <span className="block truncate max-w-[240px]" title={user.email}>{user.email}</span>
                                </td>
                                <td className="px-4 py-2.5 text-[#475569]">
                                    {user.requestedRole ? roleLabel(user.requestedRole) : '—'}
                                </td>
                                <td className="px-4 py-2.5 text-[#475569]">{formatDate(user.createdAt)}</td>
                                <td className="px-4 py-2.5">
                                    <UserStatusBadge status={user.status} />
                                </td>
                                <td className="px-4 py-2.5">
                                    <div className="flex items-center justify-end gap-1">
                                        <ActionButton
                                            title="View"
                                            icon={Eye}
                                            tone="neutral"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onView(user);
                                            }}
                                        />
                                        {user.status === 'pending_approval' && (
                                            <ActionButton
                                                title="Approve"
                                                icon={Check}
                                                tone="success"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onApprove(user);
                                                }}
                                            />
                                        )}
                                        {user.status === 'pending_approval' && (
                                            <ActionButton
                                                title="Reject"
                                                icon={X}
                                                tone="danger"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onReject(user);
                                                }}
                                            />
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {footer}
        </div>
    );
}
