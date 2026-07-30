/**
 * User Management types — mirror the backend identity module
 * (`backend/src/modules/identity/types`). Role/status are re-exported from the auth feature so there
 * is a single source of truth for those unions (see `features/auth/types.ts`).
 */

export type { UserRole, AccountStatus } from '@/features/auth/types';

import type { UserRole, AccountStatus } from '@/features/auth/types';

/** A user account as returned by `/api/users` (`PublicUser` on the backend). */
export interface UserAccount {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    /** The role the user requested at registration (null for system-created users). */
    requestedRole: UserRole | null;
    status: AccountStatus;
    /** Admin-provided reason captured on rejection (null when not rejected). */
    rejectionReason: string | null;
    lastLoginAt: string | null;
    createdAt: string;
    updatedAt: string;
    version: number;
}

/** Per-status counts from `GET /api/users/summary`. */
export interface UserSummary {
    pendingApproval: number;
    active: number;
    rejected: number;
    suspended: number;
}

/** `PATCH /api/users/:id/approve` body. `role` is required; `projectIds`/`notes` are optional. */
export interface ApproveUserInput {
    /** Admins are created out-of-band — approval may only assign a QA role. */
    role: Exclude<UserRole, 'admin'>;
    projectIds?: string[];
    notes?: string;
}

/** `PATCH /api/users/:id/reject` body — an optional human-readable reason. */
export interface RejectUserInput {
    reason?: string;
}

/** Tab keys for the user-management page (the admin-relevant subset of AccountStatus). */
export type UserTab = 'pending_approval' | 'active' | 'rejected';
