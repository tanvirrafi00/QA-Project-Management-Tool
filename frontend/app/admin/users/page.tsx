'use client';

/**
 * Admin User Management — `/admin/users`.
 *
 * The admin console for the registration-approval workflow: summary cards, status tabs, and a table
 * of users with View / Approve / Reject actions. Composes the standard
 * `AppShell` + `PageContainer` shell and the shared `Tabs` / `Pagination` (mirror of the projects
 * page). Admin-only: non-admins are bounced to `/access-denied`; the backend also enforces
 * `authorize("user:manage")` on every `/api/users` route.
 *
 * Data path: page → `userService`/`projectService` → `apiClient` (`/api/users*`) → catch-all Route
 * Handler → backend. No direct backend calls.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Users, RefreshCw, Loader2, AlertCircle } from 'lucide-react';
import { AppShell, PageContainer } from '@/components/layout';
import { Button, Tabs } from '@/components/core';
import { Pagination, usePagination } from '@/components/ui/Pagination';
import { useAuth } from '@/features/auth/AuthContext';
import { projectService } from '@/features/project-management/services/project.service';
import type { Project } from '@/features/project-management/types';
import { apiClient } from '@/lib/api-client';
import { userService } from '@/features/user-management/services/user.service';
import { UserSummaryCards } from '@/features/user-management/components/UserSummaryCards';
import { UserTable } from '@/features/user-management/components/UserTable';
import { UserDetailsModal, type DetailAction } from '@/features/user-management/components/UserDetailsModal';
import { ApproveUserModal, type RoleOption } from '@/features/user-management/components/ApproveUserModal';
import { RejectUserModal } from '@/features/user-management/components/RejectUserModal';
import type {
    ApproveUserInput,
    RejectUserInput,
    UserAccount,
    UserSummary,
    UserTab,
} from '@/features/user-management/types';
import type { AccountStatus } from '@/features/auth/types';

const TABS: { id: UserTab; label: string }[] = [
    { id: 'pending_approval', label: 'Pending Approval' },
    { id: 'active', label: 'Active Users' },
    { id: 'rejected', label: 'Rejected Users' },
];

interface Feedback {
    type: 'success' | 'error';
    message: string;
}

function FullScreenSpinner() {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-[#F9FAFB]">
            <Loader2 className="w-8 h-8 text-[#06B6D4] animate-spin mb-3" />
            <p className="text-sm text-[#64748B]">Loading…</p>
        </div>
    );
}

export default function AdminUsersPage() {
    const router = useRouter();
    const { user, status } = useAuth();
    const isAdmin = status === 'authenticated' && user?.role === 'admin';

    const [summary, setSummary] = useState<UserSummary | null>(null);
    const [users, setUsers] = useState<UserAccount[]>([]);
    const [loadingSummary, setLoadingSummary] = useState(true);
    const [loadingUsers, setLoadingUsers] = useState(true);
    const [usersError, setUsersError] = useState(false);
    const [activeTab, setActiveTab] = useState<UserTab>('pending_approval');

    const [viewUser, setViewUser] = useState<UserAccount | null>(null);
    const [approveTarget, setApproveTarget] = useState<UserAccount | null>(null);
    const [rejectTarget, setRejectTarget] = useState<UserAccount | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState<'approve' | 'reject' | null>(null);
    const [feedback, setFeedback] = useState<Feedback | null>(null);
    const [projects, setProjects] = useState<Project[]>([]);
    const [roles, setRoles] = useState<RoleOption[]>([]);

    // Bounce non-admins (defense in depth — backend also gates with user:manage).
    useEffect(() => {
        if (status === 'authenticated' && user && user.role !== 'admin') {
            router.replace('/access-denied');
        }
    }, [status, user, router]);

    // Refresh helpers used by the Refresh button and after approve/reject — all event
    // handlers, so setState-in-handler is fine. The mount/tab effects below fetch inline instead.
    const loadSummary = useCallback(async () => {
        try {
            const res = await userService.getUserSummary();
            if (res.success && res.data) setSummary(res.data);
        } catch {
            /* summary cards degrade gracefully with null */
        } finally {
            setLoadingSummary(false);
        }
    }, []);

    const loadUsers = useCallback(async (tab: UserTab) => {
        try {
            const res = await userService.listUsers(tab as AccountStatus);
            setUsers(res.success ? (res.data ?? []) : []);
            setUsersError(false);
        } catch {
            setUsersError(true);
        } finally {
            setLoadingUsers(false);
        }
    }, []);

    // Initial load (admin only): summary + active projects + requestable roles. Inline async fetch
    // with setState after await (mirrors the dashboard page) — satisfies react-hooks/set-state-in-effect.
    useEffect(() => {
        if (!isAdmin) return;
        let active = true;
        (async () => {
            try {
                const [sumRes, projRes, rolesRes] = await Promise.all([
                    userService.getUserSummary(),
                    projectService.listActiveProjects(),
                    apiClient.get<RoleOption[]>('/api/auth/roles'),
                ]);
                if (!active) return;
                if (sumRes.success && sumRes.data) setSummary(sumRes.data);
                if (projRes.success && projRes.data) setProjects(projRes.data);
                if (rolesRes.success && rolesRes.data) setRoles(rolesRes.data);
            } catch {
                /* degrade gracefully — null summary shows zero-cards */
            } finally {
                if (active) setLoadingSummary(false);
            }
        })();
        return () => {
            active = false;
        };
    }, [isAdmin]);

    // Load the user list for the active tab (also fires on first admin render).
    useEffect(() => {
        if (!isAdmin) return;
        let active = true;
        (async () => {
            try {
                const res = await userService.listUsers(activeTab as AccountStatus);
                if (!active) return;
                setUsers(res.success ? (res.data ?? []) : []);
                setUsersError(false);
            } catch {
                if (active) setUsersError(true);
            } finally {
                if (active) setLoadingUsers(false);
            }
        })();
        return () => {
            active = false;
        };
    }, [activeTab, isAdmin]);

    const refreshAll = useCallback(async () => {
        await Promise.all([loadSummary(), loadUsers(activeTab)]);
    }, [activeTab, loadSummary, loadUsers]);

    const showFeedback = useCallback((type: Feedback['type'], message: string) => {
        setFeedback({ type, message });
        window.setTimeout(() => setFeedback(null), 4000);
    }, []);

    const pagination = usePagination(users, 10, activeTab);

    // ---- Actions -----------------------------------------------------------

    const handleApprove = async (input: ApproveUserInput) => {
        if (!approveTarget) return;
        setSubmitting('approve');
        setActionError(null);
        const res = await userService.approveUser(approveTarget.id, input);
        setSubmitting(null);
        if (res.success) {
            setApproveTarget(null);
            showFeedback('success', `${approveTarget.name} approved — they can now log in.`);
            void refreshAll();
        } else {
            setActionError(res.error ?? 'Unable to approve this user.');
        }
    };

    const handleReject = async (input: RejectUserInput) => {
        if (!rejectTarget) return;
        setSubmitting('reject');
        setActionError(null);
        const res = await userService.rejectUser(rejectTarget.id, input);
        setSubmitting(null);
        if (res.success) {
            setRejectTarget(null);
            showFeedback('success', `${rejectTarget.name} rejected.`);
            void refreshAll();
        } else {
            setActionError(res.error ?? 'Unable to reject this user.');
        }
    };

    // Dispatch an action triggered from the details modal: close the details modal first (so the
    // action modal / banner doesn't stack on top of it), then route to the right handler.
    const handleDetailAction = (kind: DetailAction, target: UserAccount) => {
        setViewUser(null);
        setActionError(null);
        if (kind === 'approve') setApproveTarget(target);
        else if (kind === 'reject') setRejectTarget(target);
    };

    const tabCount = (id: UserTab): number | undefined => {
        if (!summary) return undefined;
        if (id === 'pending_approval') return summary.pendingApproval;
        if (id === 'active') return summary.active;
        return summary.rejected;
    };

    if (!isAdmin) return <FullScreenSpinner />;

    const tabsWithCounts = TABS.map((t) => ({
        ...t,
        count: tabCount(t.id),
    }));

    return (
        <AppShell>
            <PageContainer>
                <div className="space-y-6">
                    {/* Header */}
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div>
                            <h1 className="text-2xl font-bold text-[#0F172A] tracking-tight flex items-center gap-2.5">
                                <Users className="w-6 h-6 text-[#06B6D4]" />
                                User Management
                            </h1>
                            <p className="text-sm text-[#64748B] mt-1">
                                Review registration requests and manage user access.
                            </p>
                        </div>
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => void refreshAll()}
                            disabled={submitting !== null}
                            leftIcon={loadingSummary ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        >
                            Refresh
                        </Button>
                    </div>

                    {/* Feedback banner */}
                    {feedback && (
                        <div
                            className={`px-4 py-3 rounded-xl text-sm ${
                                feedback.type === 'success'
                                    ? 'bg-[#ECFDF5] border border-[#A7F3D0] text-[#047857]'
                                    : 'bg-[#FEF2F2] border border-[#FECACA] text-[#B91C1C]'
                            }`}
                        >
                            {feedback.message}
                        </div>
                    )}

                    {/* Summary cards */}
                    <UserSummaryCards summary={summary} />

                    {/* Tabs */}
                    <Tabs tabs={tabsWithCounts} activeTab={activeTab} onChange={(id) => setActiveTab(id as UserTab)} />

                    {/* Result count */}
                    {loadingUsers || usersError ? null : (
                        <p className="text-sm text-[#64748B]">
                            Showing{' '}
                            <span className="font-semibold text-[#1E293B]">{users.length}</span>{' '}
                            {users.length === 1 ? 'user' : 'users'}
                            {submitting !== null && <span className="text-[#94A3B8]"> · updating…</span>}
                        </p>
                    )}

                    {/* Table (with pagination footer) */}
                    {loadingUsers ? (
                        <div role="status" aria-live="polite" className="bg-white rounded-2xl border border-[#E2E8F0] flex flex-col items-center justify-center py-16">
                            <Loader2 className="w-7 h-7 text-[#06B6D4] animate-spin mb-2" />
                            <p className="text-sm text-[#64748B]">Loading users…</p>
                        </div>
                    ) : usersError ? (
                        <div role="alert" className="bg-white rounded-2xl border border-[#E2E8F0] flex flex-col items-center justify-center py-16 text-center">
                            <AlertCircle className="w-8 h-8 text-[#EF4444] mb-3" />
                            <p className="text-sm font-semibold text-[#1E293B] mb-1">Couldn&apos;t load users</p>
                            <p className="text-sm text-[#64748B] mb-4">Something went wrong while fetching the user list.</p>
                            <Button variant="secondary" size="sm" onClick={() => { setLoadingUsers(true); loadUsers(activeTab); }} leftIcon={<RefreshCw className="w-4 h-4" />}>
                                Retry
                            </Button>
                        </div>
                    ) : (
                        <UserTable
                            users={pagination.paginatedItems}
                            onView={setViewUser}
                            onApprove={(u) => {
                                setActionError(null);
                                setApproveTarget(u);
                            }}
                            onReject={(u) => {
                                setActionError(null);
                                setRejectTarget(u);
                            }}
                            footer={
                                pagination.totalItems > 0 ? (
                                    <Pagination
                                        page={pagination.page}
                                        totalPages={pagination.totalPages}
                                        totalItems={pagination.totalItems}
                                        startIdx={pagination.startIdx}
                                        endIdx={pagination.endIdx}
                                        pageSize={pagination.pageSize}
                                        onPageChange={pagination.setPage}
                                        onPageSizeChange={pagination.setPageSize}
                                    />
                                ) : undefined
                            }
                        />
                    )}
                </div>
            </PageContainer>

            {/* Details modal */}
            <UserDetailsModal user={viewUser} onAction={handleDetailAction} onClose={() => setViewUser(null)} />

            {/* Approve modal */}
            {approveTarget && (
                <ApproveUserModal
                    user={approveTarget}
                    projects={projects}
                    roles={roles}
                    submitting={submitting === 'approve'}
                    error={actionError}
                    onConfirm={handleApprove}
                    onClose={() => {
                        if (submitting === 'approve') return;
                        setApproveTarget(null);
                        setActionError(null);
                    }}
                />
            )}

            {/* Reject modal */}
            {rejectTarget && (
                <RejectUserModal
                    user={rejectTarget}
                    submitting={submitting === 'reject'}
                    error={actionError}
                    onConfirm={handleReject}
                    onClose={() => {
                        if (submitting === 'reject') return;
                        setRejectTarget(null);
                        setActionError(null);
                    }}
                />
            )}
        </AppShell>
    );
}
