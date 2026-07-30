/**
 * Role metadata — the single source of truth for user roles and their display labels.
 *
 * `UserRole` mirrors the `user_role` DB enum (admin | qa_lead | qa_engineer). Registration lets a
 * user *request* a non-admin role; the admin assigns the final role at approval. Adding a new role
 * to the enum + `ROLE_LABELS` automatically flows it into the registration dropdown — never hardcode
 * role lists in a route or page (docs/project-rules.md §2).
 */

import type { UserRole } from "./session";

/** Human-readable label per role (dropdowns, tables, badges). */
export const ROLE_LABELS: Record<UserRole, string> = {
    admin: "Admin",
    qa_lead: "QA Lead",
    qa_engineer: "QA Engineer",
};

/**
 * Roles a registrant may request. `admin` is created out-of-band (bootstrap), never self-requested.
 */
export const REQUESTABLE_ROLES: readonly UserRole[] = ["qa_lead", "qa_engineer"];

/** Dropdown options for the registration role selector (`{ value, label }`). */
export const REQUESTABLE_ROLE_OPTIONS = REQUESTABLE_ROLES.map((role) => ({
    value: role,
    label: ROLE_LABELS[role],
}));

/** Type guard: true when `value` is a string the UI may let a user request. */
export function isRequestableRole(value: unknown): value is UserRole {
    return typeof value === "string" && (REQUESTABLE_ROLES as readonly string[]).includes(value);
}
