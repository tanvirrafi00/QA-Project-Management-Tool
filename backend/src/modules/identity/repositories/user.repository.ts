/**
 * User repository — the SQL-backed persistence layer for the identity module (greenfield; the first
 * repository built directly on PostgreSQL, per the "identity-first" migration order). Services call
 * only these methods; nothing touches `db`/the pool outside a repository.
 */

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../../../shared/db";
import { users, userProjectAssignments } from "../../../shared/db/schema";
import type { AccountStatus, UserRole } from "../../../shared/auth";

export type UserRow = typeof users.$inferSelect;

/** A user assigned to a project — the source of the inline "Assigned To" dropdown. */
export interface ProjectMember {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    /** Per-project role override (defaults to the user's global role on assignment). */
    projectRole: UserRole;
}

export interface CreateUserRow {
    email: string;
    name: string;
    role: UserRole;
    /** The role the user requested at registration (nullable; admin may assign otherwise). */
    requestedRole?: UserRole;
    status?: AccountStatus;
    passwordHash: string;
    createdBy?: string;
    updatedBy?: string;
}

export interface UpdateUserRow {
    name?: string;
    role?: UserRole;
    status?: AccountStatus;
    passwordHash?: string;
    updatedBy?: string;
}

class UserRepository {
    async findByEmail(email: string): Promise<UserRow | undefined> {
        const rows = await db
            .select()
            .from(users)
            .where(and(eq(users.email, email.toLowerCase().trim()), isNull(users.deletedAt)))
            .limit(1);
        return rows[0];
    }

    /**
     * Find a *live* user by id. Soft-deleted rows (`deletedAt` set) are excluded — a deleted user is
     * treated as not-found by every service operation (approve/reject/suspend/activate/update/delete).
     */
    async findById(id: string): Promise<UserRow | undefined> {
        const rows = await db
            .select()
            .from(users)
            .where(and(eq(users.id, id), isNull(users.deletedAt)))
            .limit(1);
        return rows[0];
    }

    async list(): Promise<UserRow[]> {
        return db.select().from(users).where(isNull(users.deletedAt));
    }

    async listByStatus(status: AccountStatus): Promise<UserRow[]> {
        return db
            .select()
            .from(users)
            .where(and(eq(users.status, status), isNull(users.deletedAt)));
    }

    /**
     * Set status (admin action — no optimistic-lock guard). Bumps version + updatedBy. Guards
     * `deletedAt IS NULL`; when `fromStatuses` is given, also constrains the current status, making the
     * transition atomic (returns `undefined` if the row is deleted or not in an allowed source state).
     */
    async setStatus(
        id: string,
        status: AccountStatus,
        actorId?: string,
        fromStatuses?: readonly AccountStatus[],
    ): Promise<UserRow | undefined> {
        const conditions = [eq(users.id, id), isNull(users.deletedAt)];
        if (fromStatuses && fromStatuses.length > 0) {
            conditions.push(inArray(users.status, [...fromStatuses]));
        }
        const [row] = await db
            .update(users)
            .set({
                status,
                updatedBy: actorId,
                version: sql`${users.version} + 1`,
                updatedAt: new Date().toISOString(),
            })
            .where(and(...conditions))
            .returning();
        return row;
    }

    /**
     * Admin approval: set role + status=active and clear any prior rejection reason. Only applies to a
     * live user currently `pending_approval` (rejection is terminal). Bumps version; returns `undefined`
     * otherwise so the service can map it to a conflict.
     */
    async applyApproval(
        id: string,
        role: UserRole,
        actorId?: string,
    ): Promise<UserRow | undefined> {
        const [row] = await db
            .update(users)
            .set({
                role,
                status: "active",
                rejectionReason: null,
                updatedBy: actorId,
                version: sql`${users.version} + 1`,
                updatedAt: new Date().toISOString(),
            })
            .where(
                and(
                    eq(users.id, id),
                    isNull(users.deletedAt),
                    eq(users.status, "pending_approval"),
                ),
            )
            .returning();
        return row;
    }

    /** Admin rejection: set status=rejected and store the (optional) reason. Only applies to a live,
     * `pending_approval` user. Bumps version; returns `undefined` otherwise. */
    async applyRejection(
        id: string,
        reason: string | null,
        actorId?: string,
    ): Promise<UserRow | undefined> {
        const [row] = await db
            .update(users)
            .set({
                status: "rejected",
                rejectionReason: reason,
                updatedBy: actorId,
                version: sql`${users.version} + 1`,
                updatedAt: new Date().toISOString(),
            })
            .where(
                and(
                    eq(users.id, id),
                    isNull(users.deletedAt),
                    eq(users.status, "pending_approval"),
                ),
            )
            .returning();
        return row;
    }

    /** Count active admins (last-admin guard on suspend/deactivate). Excludes soft-deleted rows. */
    async countActiveAdmins(): Promise<number> {
        const rows = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(users)
            .where(
                and(
                    eq(users.role, "admin"),
                    eq(users.status, "active"),
                    isNull(users.deletedAt),
                ),
            );
        return rows[0]?.count ?? 0;
    }

    /**
     * Re-registration over a *rejected* account: reset it to `pending_approval` with the new
     * credentials/name/requested role, clearing the rejection reason. Only applies to a live, `rejected`
     * user (rejection is terminal, so the path back in is a fresh registration — not re-approval).
     * Returns `undefined` otherwise (race / wrong state) so the service can map it to a conflict.
     */
    async reRegisterRejected(
        id: string,
        input: { name: string; passwordHash: string; requestedRole: UserRole },
    ): Promise<UserRow | undefined> {
        const [row] = await db
            .update(users)
            .set({
                name: input.name,
                passwordHash: input.passwordHash,
                role: input.requestedRole,
                requestedRole: input.requestedRole,
                status: "pending_approval",
                rejectionReason: null,
                lastLoginAt: null,
                version: sql`${users.version} + 1`,
                updatedAt: new Date().toISOString(),
            })
            .where(
                and(
                    eq(users.id, id),
                    eq(users.status, "rejected"),
                    isNull(users.deletedAt),
                ),
            )
            .returning();
        return row;
    }

    async create(input: CreateUserRow): Promise<UserRow> {
        const [row] = await db
            .insert(users)
            .values({
                email: input.email.toLowerCase().trim(),
                name: input.name,
                role: input.role,
                requestedRole: input.requestedRole,
                status: input.status ?? "active",
                passwordHash: input.passwordHash,
                createdBy: input.createdBy,
                updatedBy: input.updatedBy,
            })
            .returning();
        return row;
    }

    /**
     * Optimistic-locked update; returns `undefined` on version mismatch or if the user is soft-deleted
     * (caller maps to 409 / not-found). Never mutates a tombstoned row.
     */
    async update(id: string, version: number, patch: UpdateUserRow): Promise<UserRow | undefined> {
        const [row] = await db
            .update(users)
            .set({
                ...patch,
                version: sql`${users.version} + 1`,
                updatedAt: new Date().toISOString(),
            })
            .where(
                and(eq(users.id, id), eq(users.version, version), isNull(users.deletedAt)),
            )
            .returning();
        return row;
    }

    async touchLastLogin(id: string): Promise<void> {
        await db
            .update(users)
            .set({ lastLoginAt: new Date().toISOString() })
            .where(eq(users.id, id));
    }

    /** Soft-delete: set `deletedAt` + `status=disabled`. No-ops an already-deleted row (idempotent). */
    async deactivate(id: string): Promise<void> {
        await db
            .update(users)
            .set({ deletedAt: new Date().toISOString(), status: "disabled" })
            .where(and(eq(users.id, id), isNull(users.deletedAt)));
    }

    async assignToProject(
        userId: string,
        projectId: string,
        role: UserRole,
        actorId?: string,
    ): Promise<void> {
        await db
            .insert(userProjectAssignments)
            .values({
                userId,
                projectId,
                projectRole: role,
                createdBy: actorId,
                updatedBy: actorId,
            })
            .onConflictDoNothing({
                target: [userProjectAssignments.userId, userProjectAssignments.projectId],
            });
    }

    async listAccessibleProjectIds(userId: string): Promise<string[]> {
        const rows = await db
            .select({ projectId: userProjectAssignments.projectId })
            .from(userProjectAssignments)
            .where(eq(userProjectAssignments.userId, userId));
        return rows.map((r) => r.projectId);
    }

    async isMemberOf(userId: string, projectId: string): Promise<boolean> {
        const rows = await db
            .select()
            .from(userProjectAssignments)
            .where(
                and(
                    eq(userProjectAssignments.userId, userId),
                    eq(userProjectAssignments.projectId, projectId),
                ),
            )
            .limit(1);
        return rows.length > 0;
    }

    /**
     * Active members of a project (joined from `user_project_assignments` + `users`). Feeds the inline
     * "Assigned To" dropdown. Soft-deleted and non-active users are excluded.
     */
    async listProjectMembers(projectId: string): Promise<ProjectMember[]> {
        const rows = await db
            .select({
                id: users.id,
                name: users.name,
                email: users.email,
                role: users.role,
                projectRole: userProjectAssignments.projectRole,
            })
            .from(userProjectAssignments)
            .innerJoin(users, eq(userProjectAssignments.userId, users.id))
            .where(
                and(
                    eq(userProjectAssignments.projectId, projectId),
                    isNull(users.deletedAt),
                    eq(users.status, "active"),
                ),
            );
        return rows.map((r) => ({
            id: r.id,
            name: r.name,
            email: r.email,
            role: r.role,
            projectRole: r.projectRole,
        }));
    }
}

export default new UserRepository();
