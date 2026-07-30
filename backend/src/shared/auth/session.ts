/**
 * Session types — cross-cutting auth concepts (kept under `shared` so `shared` never depends on a
 * feature module). These mirror the PostgreSQL enum labels in `shared/db/schema.ts`.
 */

/** Mirrors the `user_role` DB enum. */
export type UserRole = "admin" | "qa_lead" | "qa_engineer";

/** Mirrors the `account_status` DB enum. */
export type AccountStatus =
    | "active"
    | "disabled"
    | "pending_approval"
    | "rejected"
    | "suspended";

/** The authenticated principal, injected onto `req.user` by the `authenticate` middleware. */
export interface SessionUser {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    status: AccountStatus;
}

/** Token pair returned by login/refresh. */
export interface AuthTokens {
    accessToken: string;
    refreshToken: string;
}
