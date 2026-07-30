/**
 * Audit Columns — pure helpers for audit fields, soft delete, and optimistic concurrency.
 *
 * This module is deliberately dependency-free (only `drizzle-orm`). It does **not** import
 * `./client`, so importing it never initializes the PostgreSQL connection pool. That keeps it
 * safe to unit-test in isolation and cheap to import from anywhere (including tests).
 *
 * `BaseSqlRepository` re-exports these as protected methods so repositories get the same
 * behavior through the class, while the pure functions remain the single source of truth and
 * are directly property-testable.
 *
 * Validates: Task 2.1 · Properties 1, 2, 3, 6
 */

import { and, eq, isNull, type AnyColumn, type SQL } from "drizzle-orm";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Shape every audited table satisfies: the standard tracking columns. Used to constrain the
 * generic helpers so they only apply to tables that actually have these columns.
 */
export interface AuditColumns {
    createdAt: AnyColumn;
    updatedAt: AnyColumn;
    version: AnyColumn;
    createdBy: AnyColumn;
    updatedBy: AnyColumn;
    deletedAt: AnyColumn;
}

/** Input fragment for the audit fields populated on every INSERT. */
export interface AuditInsertInput {
    /** User id of the creator (uuid), or undefined → null until RBAC lands. */
    createdBy?: string | null;
}

/** Input fragment for the audit fields populated on every UPDATE. */
export interface AuditUpdateInput {
    /** User id of the editor (uuid), or undefined → null. */
    updatedBy?: string | null;
}

/**
 * Resolve a free-text actor ("QA Team" / "System Seed" / a display name) to a user id.
 * Until RBAC is fully wired, non-uuid values become `null`; a real uuid (from the session)
 * passes through unchanged. Mirrors the `resolveActor` helpers currently duplicated in repos.
 */
export function resolveActor(actor?: string | null): string | null {
    if (actor && UUID_RE.test(actor)) return actor;
    return null;
}

/**
 * The audit fields to merge into an INSERT payload. `createdAt`/`updatedAt`/`version` have
 * DB defaults, but setting them explicitly here makes Property 1 (audit population on
 * creation) hold regardless of defaults and keeps reads consistent immediately.
 */
export function auditOnCreate(input?: AuditInsertInput): Record<string, unknown> {
    const now = new Date().toISOString();
    const actor = resolveActor(input?.createdBy);
    return {
        createdAt: now,
        updatedAt: now,
        version: 1,
        createdBy: actor,
        updatedBy: actor,
    };
}

/**
 * The audit fields to merge into an UPDATE payload (excludes createdAt/createdBy — those are
 * immutable after creation per Property 2). `version` is NOT set here; it's bumped atomically
 * by the version-gated UPDATE so the increment can't race.
 */
export function auditOnUpdate(input?: AuditUpdateInput): Record<string, unknown> {
    return {
        updatedAt: new Date().toISOString(),
        updatedBy: resolveActor(input?.updatedBy),
    };
}

/**
 * SQL fragment selecting only live (non-deleted) rows: `deletedAt IS NULL`. Combine with
 * other conditions via `and(...)`. Satisfies the "soft delete filters deleted records"
 * acceptance criterion (Task 2.1.6).
 */
export function notDeleted<T extends { deletedAt: AnyColumn }>(table: T): SQL {
    return isNull(table.deletedAt);
}

/**
 * SQL fragment for a soft-delete UPDATE: sets `deletedAt = now()`. Pair with a
 * `WHERE id = ... AND deletedAt IS NULL` clause so an already-deleted row is a no-op.
 */
export function softDeleteSet(): Record<string, unknown> {
    return { deletedAt: new Date().toISOString() };
}

/**
 * Build the version-gated `WHERE` clause for an optimistic UPDATE:
 * `id = $1 AND version = $2`. Use together with `.set({ ..., version: sql\`version + 1\` })`.
 * When the update matches zero rows, either the id didn't exist (→ 404) or the version
 * changed concurrently (→ 409); the caller distinguishes by re-reading.
 */
export function versionMatch<T extends { id: AnyColumn; version: AnyColumn }>(
    table: T,
    id: string,
    expectedVersion: number,
): SQL {
    return and(eq(table.id, id), eq(table.version, expectedVersion))!;
}
