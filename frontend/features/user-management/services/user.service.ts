/**
 * Client Service for User Management (admin).
 *
 * Backend module mounted at `/api/users`. All HTTP goes through the shared `apiClient` (single source
 * for the URL, envelope, and error handling). The catch-all Route Handler
 * (`app/api/[...path]/route.ts`) forwards the httpOnly `auth-token` cookie as `Authorization: Bearer`,
 * which the backend `authenticate` middleware expects — so client code never touches the token.
 *
 * Response envelope is preserved end-to-end: `{ success, data?, error? }` (+ `message`/`meta`).
 */

import { apiClient, type ActionResponse } from '@/lib/api-client';
import type { AccountStatus } from '@/features/auth/types';
import type { ApproveUserInput, RejectUserInput, UserAccount, UserSummary } from '../types';

export const userService = {
    /** List users, optionally filtered by status (`?status=`). */
    async listUsers(status?: AccountStatus): Promise<ActionResponse<UserAccount[]>> {
        const path = status ? `/api/users?status=${encodeURIComponent(status)}` : '/api/users';
        const res = await apiClient.get<UserAccount[]>(path);
        return { success: res.success, data: res.data ?? [], error: res.error };
    },

    /** Per-status counts — for the summary cards + tab badges. */
    async getUserSummary(): Promise<ActionResponse<UserSummary>> {
        return apiClient.get<UserSummary>('/api/users/summary');
    },

    /** A single user by id (for the details drawer). */
    async getUser(id: string): Promise<ActionResponse<UserAccount>> {
        return apiClient.get<UserAccount>(`/api/users/${encodeURIComponent(id)}`);
    },

    /** Approve: assign the role (+ optional projects), activate, and clear any rejection reason. */
    async approveUser(id: string, input: ApproveUserInput): Promise<ActionResponse<UserAccount>> {
        return apiClient.patch<UserAccount>(`/api/users/${encodeURIComponent(id)}/approve`, input);
    },

    /** Reject with an optional reason. */
    async rejectUser(id: string, input: RejectUserInput): Promise<ActionResponse<UserAccount>> {
        return apiClient.patch<UserAccount>(`/api/users/${encodeURIComponent(id)}/reject`, input);
    },

    /** Suspend an active user. */
    async suspendUser(id: string): Promise<ActionResponse<UserAccount>> {
        return apiClient.patch<UserAccount>(`/api/users/${encodeURIComponent(id)}/suspend`, {});
    },

    /** Reactivate a suspended user (rejected users must re-register — rejection is terminal). */
    async activateUser(id: string): Promise<ActionResponse<UserAccount>> {
        return apiClient.patch<UserAccount>(`/api/users/${encodeURIComponent(id)}/activate`, {});
    },
};
