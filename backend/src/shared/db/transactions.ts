/**
 * Transaction Management — shared wrapper around Drizzle's `db.transaction()`.
 *
 * Adds the resilience + consistency layers the design (§Transaction Management) and
 * Requirement 10 call for, on top of Drizzle's built-in commit/rollback:
 *
 *   1. Automatic retry on serialization_failure / deadlock_detected (via `withTransactionRetry`),
 *      with jittered backoff so concurrent writers don't collide again.
 *   2. Every escaping error is funneled through `mapDatabaseError`, so callers always receive a
 *      typed `AppError` (constraint violations → 4xx, connection issues → 503).
 *   3. A uniform `withTransaction(fn)` signature so multi-step writes (entity + history rows)
 *      are atomic by construction.
 *
 * Drizzle already rolls back on any thrown error inside the callback, so "rollback on failure"
 * (Property 8: Transaction Atomicity) is satisfied for free — this wrapper just adds retry + mapping.
 *
 * Validates: Requirements 10.1–10.5 · Property 8 (Transaction Atomicity)
 */

import { db, withTransactionRetry } from "./client";
import type { DbClient } from "./client";
import { mapDatabaseError } from "./errors";

/**
 * A transaction body. `tx` is a Drizzle transaction client with the exact same shape as `db`,
 * so any query that works against `db` works unchanged inside a transaction.
 */
export type TransactionFn<T> = (tx: DbClient) => Promise<T>;

/**
 * Run `fn` inside a single database transaction.
 *
 * - Commits when `fn` resolves; rolls back when `fn` throws (Drizzle handles both).
 * - Retries the whole transaction on serialization/deadlock conflicts.
 * - Maps any escaping error to a typed `AppError`.
 *
 * @example
 * const created = await withTransaction(async (tx) => {
 *   const [row] = await tx.insert(bugs).values(...).returning();
 *   await tx.insert(bugHistory).values(...);
 *   return row;
 * });
 */
export async function withTransaction<T>(
    fn: TransactionFn<T>,
    operationName = "transaction",
): Promise<T> {
    try {
        return await withTransactionRetry(
            () => db.transaction(fn),
            operationName,
        );
    } catch (err) {
        throw mapDatabaseError(err);
    }
}

/**
 * Run `fn` against the main `db` client (no transaction) but still map any escaping error to a
 * typed `AppError`. Handy for single-statement reads/writes that don't need atomicity but should
 * still produce consistent error responses.
 */
export async function withMappedErrors<T>(fn: () => Promise<T>): Promise<T> {
    try {
        return await fn();
    } catch (err) {
        throw mapDatabaseError(err);
    }
}

export { db };
export type { DbClient };
