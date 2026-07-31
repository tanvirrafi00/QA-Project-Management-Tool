/**
 * Database Error Mapping — PostgreSQL SQLSTATE → typed AppError.
 *
 * Centralizes the constraint-violation → HTTP-status mapping required by the design
 * (§Error Handling) and Requirement 14. Every SQLSTATE that can escape a repository is
 * translated here into the appropriate `AppError` subclass, so the global Express handler
 * (`errorResponse`) can map it straight to the right status code without message-regex
 * sniffing in controllers.
 *
 *   23505 unique_violation      → ConflictError      (409)
 *   23503 foreign_key_violation → ValidationError     (400)
 *   23502 not_null_violation    → ValidationError     (400)
 *   23514 check_violation       → ValidationError     (400)
 *   40001 serialization_failure → ConflictError       (409)  [after retries are exhausted]
 *   40P01 deadlock_detected     → ConflictError       (409)  [after retries are exhausted]
 *   0800x / 57P0x connection    → ServiceUnavailable   (503)
 *   anything else               → AppError             (500)
 *
 * Validates: Requirements 14.1, 14.2, 14.3, 14.5, 14.6 · Property 11 (Error Mapping Consistency)
 */

import { DatabaseError } from "pg";
import {
    AppError,
    ConflictError,
    NotFoundError,
    ValidationError,
} from "../errors";

/* ------------------------------------------------------------------ *
 * SQLSTATE classification                                             *
 * ------------------------------------------------------------------ */

/** PostgreSQL SQLSTATE codes we translate specially (see `pg` docs / SQL standard). */
export const PgSqlState = {
    UNIQUE_VIOLATION: "23505",
    FOREIGN_KEY_VIOLATION: "23503",
    NOT_NULL_VIOLATION: "23502",
    CHECK_VIOLATION: "23514",
    EXCLUSION_VIOLATION: "23P01",
    SERIALIZATION_FAILURE: "40001",
    DEADLOCK_DETECTED: "40P01",
    INSUFFICIENT_PRIVILEGE: "42501",
    UNDEFINED_TABLE: "42P01",
    UNDEFINED_COLUMN: "42703",
    STRING_DATA_RIGHT_TRUNCATION: "22001",
    /** invalid_text_representation — e.g. a malformed UUID/value reaching a typed column. */
    INVALID_TEXT_REPRESENTATION: "22P02",
} as const;

/** Connection-class SQLSTATE prefixes (08xxx connection, 57P0x shutdown). */
const CONNECTION_PREFIXES = ["08", "57P0"];

/** True when `err` is a `pg` DatabaseError carrying a 5-char SQLSTATE `code`. */
export function isDatabaseError(err: unknown): err is DatabaseError {
    return (
        err instanceof DatabaseError &&
        typeof err.code === "string" &&
        err.code.length === 5
    );
}

/** True for connection-class errors that typically warrant a 503 + retry. */
export function isConnectionError(err: unknown): boolean {
    return (
        isDatabaseError(err) &&
        (CONNECTION_PREFIXES.some((p) => err.code!.startsWith(p)) ||
            err.code === "53300") // too_many_connections
    );
}

/* ------------------------------------------------------------------ *
 * Human-friendly message builders                                     *
 * ------------------------------------------------------------------ */

/**
 * Map a constraint name (e.g. `projects_name_lower_uidx`, `bugs_bug_id_uk`) to a
 * field-level, human-readable message. Falls back to the raw detail when unknown so the
 * client always gets something actionable.
 */
function describeUniqueViolation(err: DatabaseError): string {
    const constraint = err.constraint ?? "";

    // Constraint-name → friendly field hint (mirrors schema.ts unique constraints).
    const known: Record<string, string> = {
        users_email_lower_uidx: "A user with that email already exists",
        projects_code_uk: "A project with that code already exists",
        projects_name_lower_uidx: "A project with that name already exists",
        bugs_bug_id_uk: "A bug with that ID already exists",
        test_cases_tc_id_uk: "A test case with that ID already exists",
        test_cases_dedup_uidx:
            "A test case with the same module and name already exists in this project",
        upa_user_project_uk: "The user is already assigned to that project",
        refresh_tokens_token_hash_uidx: "Refresh token conflict",
    };

    if (known[constraint]) return known[constraint];
    // PG `detail` is human-readable, e.g. `Key (email)=(foo@bar.com) already exists.` — safe to surface.
    // Never fall back to `err.message`: it can contain the raw SQLSTATE code (Property 11: no leak).
    if (err.detail) return err.detail;
    return `Value must be unique${constraint ? ` (${constraint})` : ""}`;
}

function describeForeignKeyViolation(err: DatabaseError): string {
    const constraint = err.constraint ?? "";
    // PG `detail` is human-readable, e.g. `Key (project_id)=(...) is not present in table "projects".`
    // Never fall back to `err.message`: it can contain the raw SQLSTATE code (Property 11: no leak).
    if (err.detail) return err.detail.replace(/^Key /, "Referenced ").replace(/\s+/g, " ").trim();
    return `Referenced record does not exist${constraint ? ` (${constraint})` : ""}`;
}

function describeNotNullViolation(err: DatabaseError): string {
    const col = err.column ?? "a required field";
    return `Missing required field: ${col}`;
}

function describeCheckViolation(err: DatabaseError): string {
    const constraint = err.constraint ?? "";
    return `Value violates a check constraint${constraint ? ` (${constraint})` : ""}`;
}

/* ------------------------------------------------------------------ *
 * The mapper                                                          *
 * ------------------------------------------------------------------ */

/**
 * Translate any thrown value into a typed `AppError`.
 *
 * - Already-typed `AppError`s pass through untouched (so services/controllers keep full control).
 * - `pg` DatabaseErrors are mapped by SQLSTATE to the right status + a descriptive message.
 * - Everything else becomes a generic 500 (details are never leaked to the client).
 *
 * Use this at repository boundaries (via `BaseSqlRepository.mapErrors`) or as a safety net
 * in the global error handler.
 */
export function mapDatabaseError(err: unknown): AppError {
    // 1. Already a typed domain error — respect the caller's intent.
    if (err instanceof AppError) return err;

    // 2. Not a pg error — wrap generically without leaking internals.
    if (!isDatabaseError(err)) {
        const message = err instanceof Error ? err.message : String(err);
        // Preserve the friendly "not found" / "already exists" messages some repos throw
        // as plain Errors (so the existing controller status sniffing keeps working too).
        if (/not found/i.test(message)) return new NotFoundError(message);
        if (/already exists/i.test(message)) return new ConflictError(message);
        return new AppError("Internal Server Error", 500, "INTERNAL_ERROR");
    }

    // 3. Map by SQLSTATE.
    switch (err.code) {
        case PgSqlState.UNIQUE_VIOLATION:
            return new ConflictError(describeUniqueViolation(err));

        case PgSqlState.FOREIGN_KEY_VIOLATION:
            return new ValidationError(describeForeignKeyViolation(err));

        case PgSqlState.NOT_NULL_VIOLATION:
            return new ValidationError(describeNotNullViolation(err));

        case PgSqlState.CHECK_VIOLATION:
        case PgSqlState.EXCLUSION_VIOLATION:
            return new ValidationError(describeCheckViolation(err));

        case PgSqlState.SERIALIZATION_FAILURE:
        case PgSqlState.DEADLOCK_DETECTED:
            // These are retried upstream; if they still escape, surface as a conflict so the
            // client knows to retry (rather than a opaque 500).
            return new ConflictError(
                "The record was modified by a concurrent transaction — please retry",
            );

        case PgSqlState.INSUFFICIENT_PRIVILEGE:
            return new AppError("Insufficient database privileges", 403, "FORBIDDEN");

        case PgSqlState.UNDEFINED_TABLE:
        case PgSqlState.UNDEFINED_COLUMN:
            // Schema drift / programming error — log full detail server-side; generic to client.
            return new AppError("Internal Server Error", 500, "SCHEMA_ERROR");

        case PgSqlState.STRING_DATA_RIGHT_TRUNCATION:
            return new ValidationError("One of the provided values is too long");

        case PgSqlState.INVALID_TEXT_REPRESENTATION:
            // Malformed input for a typed column (most often a non-UUID passed to a uuid column).
            return new ValidationError("One of the provided values has an invalid format");

        default:
            // Connection-class errors → 503 (retryable by the client).
            if (isConnectionError(err)) {
                return new AppError(
                    "Database is temporarily unavailable",
                    503,
                    "DATABASE_UNAVAILABLE",
                );
            }
            return new AppError("Internal Server Error", 500, "DATABASE_ERROR");
    }
}

/**
 * Convenience: run an async operation and rethrow any error through `mapDatabaseError`.
 * Repositories wrap their DB calls in this so callers always receive a typed `AppError`.
 */
export async function mapDbErrors<T>(operation: () => Promise<T>): Promise<T> {
    try {
        return await operation();
    } catch (err) {
        throw mapDatabaseError(err);
    }
}
