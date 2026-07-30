/**
 * Identity module types. `SessionUser`/`AuthTokens`/`UserRole`/`AccountStatus` are re-exported from
 * `shared/auth` (single source of truth); the rest are module-local DTOs.
 */

export type { AccountStatus, AuthTokens, SessionUser, UserRole } from "../../../shared/auth";

export interface PublicUser {
    id: string;
    email: string;
    name: string;
    role: import("../../../shared/auth").UserRole;
    /** The role the user requested at registration (null for system-created users). */
    requestedRole: import("../../../shared/auth").UserRole | null;
    status: import("../../../shared/auth").AccountStatus;
    /** Admin-provided reason captured on rejection (null when not rejected). */
    rejectionReason: string | null;
    lastLoginAt: string | null;
    createdAt: string;
    updatedAt: string;
    version: number;
}

export interface LoginInput {
    email: string;
    password: string;
    userAgent?: string;
    ip?: string;
}

export interface RegisterInput {
    email: string;
    name: string;
    password: string;
}

export interface CreateUserInput {
    email: string;
    name: string;
    password: string;
    role: import("../../../shared/auth").UserRole;
}

export interface UpdateUserInput {
    name?: string;
    role?: import("../../../shared/auth").UserRole;
    status?: import("../../../shared/auth").AccountStatus;
    password?: string;
}

export interface AssignmentInput {
    projectId: string;
    role: import("../../../shared/auth").UserRole;
}

/** `PATCH /api/users/:id/approve` body. `role` is required; `projectIds`/`notes` are optional. */
export interface ApproveUserInput {
    role: import("../../../shared/auth").UserRole;
    projectIds?: string[];
    notes?: string;
}

/** `PATCH /api/users/:id/reject` body — an optional human-readable reason. */
export interface RejectUserInput {
    reason?: string;
}
