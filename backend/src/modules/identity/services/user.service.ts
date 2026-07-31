/**
 * User service — admin user-management operations (create/list/update/deactivate) and project member
 * assignment. Validates business rules (email uniqueness, existence, status transitions) and throws
 * typed errors. Uses optimistic locking on update (version mismatch → `ConflictError`).
 *
 * Account-status state machine (admin actions):
 *   register          → pending_approval
 *   approve           : pending_approval → active            (rejection is terminal; rejected users
 *                                                       may NOT be re-approved — they must re-register)
 *   reject            : pending_approval → rejected
 *   suspend           : active          → suspended
 *   activate          : suspended       → active
 *   deactivate/delete : any live status → disabled (+ soft-delete via `deletedAt`)
 * A soft-deleted user is not found by any operation (the repository excludes `deletedAt` rows).
 */

import { hashPassword, type AccountStatus, type UserRole } from "../../../shared/auth";
import activityLogRepository from "../../../shared/db/repositories/activity-log.repository";
import { ConflictError, NotFoundError, ValidationError } from "../../../shared/errors";
import logger from "../../../shared/logger";
import tokenRepository from "../repositories/refresh-token.repository";
import userRepository, { type UserRow } from "../repositories/user.repository";
import type {
    ApproveUserInput,
    AssignmentInput,
    CreateUserInput,
    PublicUser,
    RejectUserInput,
    UpdateUserInput,
} from "../types";

/** Roles an admin may assign at approval time (Admin accounts are created out-of-band, not via approval). */
const APPROVAL_TARGET_ROLES: ReadonlySet<UserRole> = new Set<UserRole>(["qa_lead", "qa_engineer"]);

/** Runtime-validated role/status values (mirror the `user_role` / `account_status` DB enums). */
const USER_ROLES: ReadonlySet<UserRole> = new Set<UserRole>(["admin", "qa_lead", "qa_engineer"]);
const ACCOUNT_STATUSES: ReadonlySet<AccountStatus> = new Set<AccountStatus>([
    "active",
    "disabled",
    "pending_approval",
    "rejected",
    "suspended",
]);

/**
 * Guard against locking the platform out: an active admin may only be suspended/deleted if at least one
 * other active admin remains. Non-admins and non-active rows pass through untouched.
 */
async function assertNotLastAdmin(row: UserRow): Promise<void> {
    if (row.role !== "admin" || row.status !== "active") return;
    const count = await userRepository.countActiveAdmins();
    if (count <= 1) {
        throw new ConflictError("Cannot remove the last remaining administrator account.");
    }
}

/** Human-readable message for a disallowed status transition. */
function cannotTransition(action: string, current: AccountStatus): string {
    return `Cannot ${action} a user who is currently "${current}". Refresh and try again.`;
}

export interface UserSummary {
    pendingApproval: number;
    active: number;
    rejected: number;
    suspended: number;
}

function toPublicUser(u: UserRow): PublicUser {
    return {
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        requestedRole: u.requestedRole ?? null,
        status: u.status,
        rejectionReason: u.rejectionReason ?? null,
        lastLoginAt: u.lastLoginAt,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
        version: u.version,
    };
}

export const userService = {
    async create(input: CreateUserInput, actorId: string): Promise<PublicUser> {
        if (!USER_ROLES.has(input.role)) {
            throw new ValidationError(`role must be one of: ${[...USER_ROLES].join(", ")}`);
        }
        const existing = await userRepository.findByEmail(input.email);
        if (existing) {
            throw new ConflictError(`A user with email "${input.email}" already exists`);
        }
        const passwordHash = await hashPassword(input.password);
        const row = await userRepository.create({
            email: input.email,
            name: input.name,
            role: input.role,
            passwordHash,
            createdBy: actorId,
            updatedBy: actorId,
        });
        return toPublicUser(row);
    },

    async list(status?: AccountStatus): Promise<PublicUser[]> {
        const rows = status ? await userRepository.listByStatus(status) : await userRepository.list();
        return rows.map(toPublicUser);
    },

    /** Per-status counts for the admin user-management summary cards + tab badges. */
    async summary(): Promise<UserSummary> {
        const [pendingApproval, active, rejected, suspended] = await Promise.all([
            userRepository.listByStatus("pending_approval"),
            userRepository.listByStatus("active"),
            userRepository.listByStatus("rejected"),
            userRepository.listByStatus("suspended"),
        ]);
        return {
            pendingApproval: pendingApproval.length,
            active: active.length,
            rejected: rejected.length,
            suspended: suspended.length,
        };
    },

    async getById(id: string): Promise<PublicUser> {
        const row = await userRepository.findById(id);
        if (!row) throw new NotFoundError("User not found");
        return toPublicUser(row);
    },

    async update(id: string, version: number, input: UpdateUserInput, actorId: string): Promise<PublicUser> {
        if (input.role !== undefined && !USER_ROLES.has(input.role)) {
            throw new ValidationError(`role must be one of: ${[...USER_ROLES].join(", ")}`);
        }
        if (input.status !== undefined && !ACCOUNT_STATUSES.has(input.status)) {
            throw new ValidationError(`status must be one of: ${[...ACCOUNT_STATUSES].join(", ")}`);
        }

        const patch: {
            name?: string;
            role?: UserRole;
            status?: AccountStatus;
            passwordHash?: string;
            updatedBy: string;
        } = { updatedBy: actorId };
        if (input.name !== undefined) patch.name = input.name;
        if (input.role !== undefined) patch.role = input.role;
        if (input.status !== undefined) patch.status = input.status;
        if (input.password !== undefined) patch.passwordHash = await hashPassword(input.password);

        // Last-admin guard: refuse to remove the only active administrator via a role downgrade or a
        // non-active status. `deactivate`/`suspend` already guard this; `update` previously did not,
        // so PATCHing the last admin to `{role:"qa_engineer"}` or `{status:"disabled"}` could lock the
        // platform out. The `version` optimistic-lock check below covers concurrent modification.
        const existing = await userRepository.findById(id);
        if (!existing) throw new NotFoundError("User not found");
        const demotingAdmin =
            existing.role === "admin" &&
            existing.status === "active" &&
            ((patch.role !== undefined && patch.role !== "admin") ||
                (patch.status !== undefined && patch.status !== "active"));
        if (demotingAdmin) {
            await assertNotLastAdmin(existing);
        }

        const row = await userRepository.update(id, version, patch);
        if (!row) {
            throw new ConflictError("This user was modified by another request; refresh and try again");
        }

        // Privilege/status reduction must invalidate outstanding sessions: the access token is self-
        // describing, so a demoted or suspended user would otherwise keep their old (higher) role until
        // the short access TTL expires. Revoke all refresh tokens, forcing re-login on the next refresh.
        const reducesAccess =
            demotingAdmin ||
            patch.role !== undefined ||
            (patch.status !== undefined && patch.status !== "active");
        if (reducesAccess) {
            await tokenRepository.revokeAllForUser(id).catch((err) => {
                logger.warn("Failed to revoke sessions after user update", {
                    userId: id,
                    error: String(err),
                });
            });
        }

        return toPublicUser(row);
    },

    /**
     * Soft-delete (admin "remove"). Guards: existence, no self-deletion, and the last-admin rule.
     * Sets `deletedAt` + `status=disabled`; the user then vanishes from every list and is not found
     * by any subsequent operation.
     */
    async deactivate(id: string, actorId: string): Promise<void> {
        const row = await userRepository.findById(id);
        if (!row) throw new NotFoundError("User not found");
        if (row.id === actorId) {
            throw new ConflictError("You cannot delete your own account.");
        }
        await assertNotLastAdmin(row);
        await userRepository.deactivate(id);
        // Invalidate all outstanding sessions for the removed user.
        await tokenRepository.revokeAllForUser(id).catch((err) => {
            logger.warn("Failed to revoke sessions after user deactivation", {
                userId: id,
                error: String(err),
            });
        });
    },

    async assignMember(userId: string, input: AssignmentInput, actorId: string): Promise<void> {
        if (!USER_ROLES.has(input.role)) {
            throw new ValidationError(`role must be one of: ${[...USER_ROLES].join(", ")}`);
        }
        const row = await userRepository.findById(userId);
        if (!row) throw new NotFoundError("User not found");
        await userRepository.assignToProject(userId, input.projectId, input.role, actorId);
    },

    /** Users awaiting admin approval (admin user-management). */
    async listPending(): Promise<PublicUser[]> {
        const rows = await userRepository.listByStatus("pending_approval");
        return rows.map(toPublicUser);
    },

    /**
     * Approve a user: validate + assign the target role, (optionally) assign projects, set status=active,
     * clear any prior rejection reason, and write an audit entry. Role must be qa_lead|qa_engineer.
     * Only a live `pending_approval` user may be approved — rejection is terminal (a rejected user must
     * re-register; re-approving them is not permitted).
     */
    async approve(id: string, input: ApproveUserInput, actorId: string): Promise<PublicUser> {
        const role = input.role;
        if (!APPROVAL_TARGET_ROLES.has(role)) {
            throw new ValidationError(`Role must be one of: ${[...APPROVAL_TARGET_ROLES].join(", ")}`);
        }
        const existing = await userRepository.findById(id);
        if (!existing) throw new NotFoundError("User not found");
        if (existing.status !== "pending_approval") {
            // Deleted users are already excluded by findById; anything else (active/rejected/suspended/
            // disabled) is a state-machine violation. Rejection being terminal is enforced here.
            throw new ConflictError(
                `Only users awaiting approval can be approved. This user is "${existing.status}".`,
            );
        }

        const updated = await userRepository.applyApproval(id, role, actorId);
        if (!updated) {
            throw new ConflictError("This user's status changed; refresh and try again");
        }

        const projectIds = input.projectIds ?? [];
        for (const projectId of projectIds) {
            await userRepository.assignToProject(id, projectId, role, actorId);
        }

        await activityLogRepository.log({
            actorId,
            action: "user.approve",
            entityType: "user",
            entityId: id,
            metadata: { role, projectIds, notes: input.notes ?? null },
        });

        return toPublicUser(updated);
    },

    /** Reject a user: set status=rejected, store the (optional) reason, and write an audit entry.
     * Only a live `pending_approval` user may be rejected. */
    async reject(id: string, input: RejectUserInput, actorId: string): Promise<PublicUser> {
        const existing = await userRepository.findById(id);
        if (!existing) throw new NotFoundError("User not found");
        if (existing.status !== "pending_approval") {
            throw new ConflictError(
                `Only users awaiting approval can be rejected. This user is "${existing.status}".`,
            );
        }

        const reason = input.reason?.trim() ? input.reason.trim() : null;
        const updated = await userRepository.applyRejection(id, reason, actorId);
        if (!updated) {
            throw new ConflictError("This user's status changed; refresh and try again");
        }

        await activityLogRepository.log({
            actorId,
            action: "user.reject",
            entityType: "user",
            entityId: id,
            metadata: { reason },
        });

        return toPublicUser(updated);
    },

    /** Suspend an active user. Guards: existence, source status `active`, no self-suspend, last-admin. */
    async suspend(id: string, actorId: string): Promise<PublicUser> {
        const existing = await userRepository.findById(id);
        if (!existing) throw new NotFoundError("User not found");
        if (existing.id === actorId) {
            throw new ConflictError("You cannot suspend your own account.");
        }
        await assertNotLastAdmin(existing);
        if (existing.status !== "active") {
            throw new ConflictError(cannotTransition("suspend", existing.status));
        }
        const updated = await userRepository.setStatus(id, "suspended", actorId, ["active"]);
        if (!updated) {
            throw new ConflictError("This user's status changed; refresh and try again");
        }
        // A suspended user must not keep using an already-issued access token.
        await tokenRepository.revokeAllForUser(id).catch((err) => {
            logger.warn("Failed to revoke sessions after user suspension", {
                userId: id,
                error: String(err),
            });
        });
        return toPublicUser(updated);
    },
    async activate(id: string, actorId: string): Promise<PublicUser> {
        const existing = await userRepository.findById(id);
        if (!existing) throw new NotFoundError("User not found");
        if (existing.status !== "suspended") {
            throw new ConflictError(cannotTransition("activate", existing.status));
        }
        const updated = await userRepository.setStatus(id, "active", actorId, ["suspended"]);
        if (!updated) {
            throw new ConflictError("This user's status changed; refresh and try again");
        }
        return toPublicUser(updated);
    },
};
