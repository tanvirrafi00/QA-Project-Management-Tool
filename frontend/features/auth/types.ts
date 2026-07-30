/**
 * Auth types — mirror the backend identity session shape.
 */

export type UserRole = "admin" | "qa_lead" | "qa_engineer";

export type AccountStatus =
    | "active"
    | "disabled"
    | "pending_approval"
    | "rejected"
    | "suspended";

/** Authenticated principal (from GET /auth/me). */
export interface SessionUser {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    status: AccountStatus;
}

export interface AuthResult {
    success: boolean;
    user?: SessionUser;
    /** Human-readable error message from the backend envelope (`{ success: false, error }`). */
    error?: string;
    /** Field-level validation errors keyed by field name (e.g. `{ email: "..." }`). */
    errors?: Record<string, string>;
}
