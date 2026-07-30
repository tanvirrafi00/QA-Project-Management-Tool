/**
 * Base SQL Repository — shared infrastructure for every Drizzle/PostgreSQL repository.
 *
 * Consolidates the patterns that were previously copy-pasted across the per-entity SQL
 * repositories (`project.repository.sql.ts`, `bug.repository.sql.ts`, …):
 *
 *   - Audit-field population (createdAt/updatedAt/version/createdBy/updatedBy) on insert & update.
 *   - Soft-delete filtering (only live rows where `deletedAt IS NULL`).
 *   - Optimistic-concurrency UPDATE (version in the WHERE clause, atomic increment).
 *   - Actor resolution (free-text → user id; uuid passthrough until RBAC fully lands).
 *   - Error mapping (every escaping error → typed `AppError`).
 *
 * The pure audit/soft-delete/optimistic-lock helpers live in [`./audit-columns`](./audit-columns.ts)
 * (dependency-free, unit-testable). This class re-exposes them as protected methods and adds the
 * two pieces that *do* need the live DB client: error-mapped execution and transactions.
 *
 * Existing repositories keep working unchanged; new ones extend this base to get the shared
 * behavior for free and to guarantee the correctness properties (audit population, soft delete,
 * optimistic locking, error mapping) hold uniformly.
 *
 * Validates: Task 2.1 · Properties 1, 2, 3, 6, 11
 */

import type { AnyColumn, SQL } from "drizzle-orm";
import type { DbClient } from "./client";
import {
    auditOnCreate as auditOnCreateImpl,
    auditOnUpdate as auditOnUpdateImpl,
    notDeleted as notDeletedImpl,
    resolveActor as resolveActorImpl,
    softDeleteSet as softDeleteSetImpl,
    versionMatch as versionMatchImpl,
} from "./audit-columns";
import type {
    AuditColumns,
    AuditInsertInput,
    AuditUpdateInput,
} from "./audit-columns";
import { mapDatabaseError } from "./errors";
import { withTransaction, type TransactionFn } from "./transactions";

export abstract class BaseSqlRepository {
    /* ------------------------------------------------------------------ *
     * Error mapping                                                       *
     * ------------------------------------------------------------------ */

    /**
     * Run an async DB operation, rethrowing any error through `mapDatabaseError`. Wrap every
     * repository method body in this so callers always receive a typed `AppError`.
     */
    protected async mapErrors<T>(operation: () => Promise<T>): Promise<T> {
        try {
            return await operation();
        } catch (err) {
            throw mapDatabaseError(err);
        }
    }

    /* ------------------------------------------------------------------ *
     * Transactions                                                        *
     * ------------------------------------------------------------------ */

    /** Run a multi-step write atomically (entity + history rows), with retry + error mapping. */
    protected tx<T>(fn: TransactionFn<T>, name?: string): Promise<T> {
        return withTransaction(fn, name ?? `${this.constructor.name}.tx`);
    }

    /* ------------------------------------------------------------------ *
     * Actor resolution                                                    *
     * ------------------------------------------------------------------ */

    /**
     * Resolve a free-text actor ("QA Team" / "System Seed" / a display name) to a user id.
     * Until RBAC is fully wired, non-uuid values become `null`; a real uuid (from the session)
     * passes through unchanged. Delegates to the pure [`resolveActor`](./audit-columns.ts).
     */
    protected resolveActor(actor?: string | null): string | null {
        return resolveActorImpl(actor);
    }

    /* ------------------------------------------------------------------ *
     * Audit-field population                                              *
     * ------------------------------------------------------------------ */

    /**
     * The audit fields to merge into an INSERT payload. `createdAt`/`updatedAt`/`version` have
     * DB defaults, but setting them explicitly here makes Property 1 (audit population on
     * creation) hold regardless of defaults and keeps reads consistent immediately.
     */
    protected auditOnCreate(input?: AuditInsertInput): Record<string, unknown> {
        return auditOnCreateImpl(input);
    }

    /**
     * The audit fields to merge into an UPDATE payload (excludes createdAt/createdBy — those are
     * immutable after creation per Property 2). `version` is NOT set here; it's bumped atomically
     * by the version-gated UPDATE so the increment can't race.
     */
    protected auditOnUpdate(input?: AuditUpdateInput): Record<string, unknown> {
        return auditOnUpdateImpl(input);
    }

    /* ------------------------------------------------------------------ *
     * Soft delete                                                         *
     * ------------------------------------------------------------------ */

    /**
     * SQL fragment selecting only live (non-deleted) rows: `deletedAt IS NULL`. Combine with
     * other conditions via `and(...)`. Satisfies the "soft delete filters deleted records"
     * acceptance criterion (Task 2.1.6).
     */
    protected notDeleted<T extends { deletedAt: AnyColumn }>(table: T): SQL {
        return notDeletedImpl(table);
    }

    /**
     * SQL fragment for a soft-delete UPDATE: sets `deletedAt = now()`. Pair with a
     * `WHERE id = ... AND deletedAt IS NULL` clause so an already-deleted row is a no-op.
     */
    protected softDeleteSet(): Record<string, unknown> {
        return softDeleteSetImpl();
    }

    /* ------------------------------------------------------------------ *
     * Optimistic concurrency control                                      *
     * ------------------------------------------------------------------ */

    /**
     * Build the version-gated `WHERE` clause for an optimistic UPDATE:
     * `id = $1 AND version = $2`. Use together with `.set({ ..., version: sql\`version + 1\` })`.
     * When the update matches zero rows, either the id didn't exist (→ 404) or the version
     * changed concurrently (→ 409); the caller distinguishes by re-reading.
     */
    protected versionMatch<T extends { id: AnyColumn; version: AnyColumn }>(
        table: T,
        id: string,
        expectedVersion: number,
    ): SQL {
        return versionMatchImpl(table, id, expectedVersion);
    }
}

// Re-export the pure helpers + types so consumers can import everything from one place.
export {
    resolveActor,
    auditOnCreate,
    auditOnUpdate,
    notDeleted,
    softDeleteSet,
    versionMatch,
} from "./audit-columns";
export type { AuditColumns, AuditInsertInput, AuditUpdateInput } from "./audit-columns";

export { withTransaction };
export type { DbClient, TransactionFn };
