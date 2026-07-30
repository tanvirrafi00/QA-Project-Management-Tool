/**
 * RBAC action vocabulary + role→action mapping (see `docs/rbac-design.md`).
 *
 * Single source of truth for what each role may do. The `authorize` middleware consumes this.
 * Project-scoped actions additionally require project membership (resolved in the middleware via the
 * identity repository) unless the caller is an admin.
 */

import type { UserRole } from "./session";

export const ACTIONS = [
    "user:manage",
    "project:create",
    "project:update",
    "project:archive",
    "project:delete",
    "project:assign",
    "bug:create",
    "bug:update",
    "bug:delete",
    "testcase:create",
    "testcase:update",
    "testcase:delete",
    "testcase:execute",
    "report:view",
    "settings:manage",
    // Project Estimation module (module-level QA effort estimation).
    "estimation:create",
    "estimation:read",
    "estimation:update",
    "estimation:delete",
    "estimation:submit",
    "estimation:review",
    "estimation:approve",
    "estimation:assign",
] as const;

export type Action = (typeof ACTIONS)[number];

const ALL = new Set<Action>(ACTIONS);

/** Admin: everything. */
const ADMIN_ACTIONS = ALL;

/** QA Lead: project leadership within assigned projects (no user/global management, no create/delete of projects). */
const QA_LEAD_ACTIONS: Action[] = [
    "project:update",
    "project:archive",
    "project:assign",
    "bug:create",
    "bug:update",
    "bug:delete",
    "testcase:create",
    "testcase:update",
    "testcase:delete",
    "testcase:execute",
    "report:view",
    // Estimation: lead sets up the structure (versions/modules) and reviews/approves/assigns.
    "estimation:create",
    "estimation:read",
    "estimation:update",
    "estimation:delete",
    "estimation:submit",
    "estimation:review",
    "estimation:approve",
    "estimation:assign",
];

/** QA Engineer: day-to-day execution within assigned projects (no deletes, no project management). */
const QA_ENGINEER_ACTIONS: Action[] = [
    "bug:create",
    "bug:update",
    "testcase:create",
    "testcase:update",
    "testcase:execute",
    "report:view",
    // Estimation: create/submit own estimates, read all in scope. Owner-only edit is enforced in the service.
    "estimation:create",
    "estimation:read",
    "estimation:update",
    "estimation:submit",
];

export const ROLE_ACTIONS: Record<UserRole, Set<Action>> = {
    admin: ADMIN_ACTIONS,
    qa_lead: new Set(QA_LEAD_ACTIONS),
    qa_engineer: new Set(QA_ENGINEER_ACTIONS),
};

/** Actions that operate on a specific project and therefore require membership for non-admins. */
export const PROJECT_SCOPED_ACTIONS: Set<Action> = new Set<Action>([
    "project:update",
    "project:archive",
    "project:assign",
    "project:delete",
    "bug:create",
    "bug:update",
    "bug:delete",
    "testcase:create",
    "testcase:update",
    "testcase:delete",
    "testcase:execute",
    "report:view",
    "estimation:create",
    "estimation:read",
    "estimation:update",
    "estimation:delete",
    "estimation:submit",
    "estimation:review",
    "estimation:approve",
    "estimation:assign",
]);

export function roleHasAction(role: UserRole, action: Action): boolean {
    return ROLE_ACTIONS[role]?.has(action) ?? false;
}
