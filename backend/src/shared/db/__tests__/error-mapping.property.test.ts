/**
 * Property-Based Tests — Database Error Mapping & Audit Helpers
 *
 * **Validates: Requirements 3.2, 3.3, 14.1, 14.2, 14.3 · Properties 1, 2, 11**
 *
 * These exercise the REAL pure functions:
 *   - `mapDatabaseError` (shared/db/errors.ts) — SQLSTATE → typed AppError
 *   - `auditOnCreate` / `auditOnUpdate` (shared/db/audit-columns.ts) — audit-field builders
 *
 * No live database is required: the mapper is a pure function over `pg.DatabaseError` objects,
 * and the audit helpers are pure object builders. fast-check generates the input space.
 *
 * NOTE: We import from `../audit-columns` (not `../base.repository`) deliberately — the audit
 * helpers are dependency-free, so importing them never initializes the PostgreSQL connection
 * pool. This keeps the test fast and side-effect-free.
 *
 * Tag format per the design doc: **Feature: postgresql-persistence, Property {number}: {text}**
 */

import { DatabaseError } from "pg";
import fc from "fast-check";
import {
    AppError,
    ConflictError,
    NotFoundError,
    ValidationError,
} from "../../errors";
import {
    mapDatabaseError,
    isDatabaseError,
    PgSqlState,
} from "../errors";
import { auditOnCreate, auditOnUpdate } from "../audit-columns";

/* ------------------------------------------------------------------ *
 * Helpers                                                             *
 * ------------------------------------------------------------------ */

/** Build a realistic `pg` DatabaseError with the given SQLSTATE + optional constraint/detail. */
function pgError(
    code: string,
    opts: { constraint?: string; detail?: string; column?: string; message?: string } = {},
): DatabaseError {
    const err = new DatabaseError(
        opts.message ?? `database error ${code}`,
        0,
        "error",
    );
    // `code` and friends are public mutable fields on DatabaseError.
    (err as DatabaseError).code = code;
    if (opts.constraint !== undefined) err.constraint = opts.constraint;
    if (opts.detail !== undefined) err.detail = opts.detail;
    if (opts.column !== undefined) err.column = opts.column;
    return err;
}

const UUID_SAMPLE = "12345678-1234-1234-1234-1234567890ab";

/* ================================================================== *
 * Property 11: Error Mapping Consistency                              *
 * ================================================================== */

describe("**Feature: postgresql-persistence, Property 11: Error Mapping Consistency**", () => {
    /**
     * **Validates: Requirements 14.1, 14.2, 14.3**
     *
     * Property: For any PostgreSQL constraint violation type (unique, foreign key, not null),
     * the repository SHALL map the database error to the appropriate HTTP status code
     * consistently — the same SQLSTATE always yields the same status, every time.
     */
    it("maps every known SQLSTATE to a consistent, correct HTTP status (100 iterations)", () => {
        const cases: Array<{ code: string; status: number; cls: any }> = [
            { code: PgSqlState.UNIQUE_VIOLATION, status: 409, cls: ConflictError },
            { code: PgSqlState.FOREIGN_KEY_VIOLATION, status: 400, cls: ValidationError },
            { code: PgSqlState.NOT_NULL_VIOLATION, status: 400, cls: ValidationError },
            { code: PgSqlState.CHECK_VIOLATION, status: 400, cls: ValidationError },
            { code: PgSqlState.EXCLUSION_VIOLATION, status: 400, cls: ValidationError },
            { code: PgSqlState.SERIALIZATION_FAILURE, status: 409, cls: ConflictError },
            { code: PgSqlState.DEADLOCK_DETECTED, status: 409, cls: ConflictError },
            { code: PgSqlState.INSUFFICIENT_PRIVILEGE, status: 403, cls: AppError },
            { code: PgSqlState.STRING_DATA_RIGHT_TRUNCATION, status: 400, cls: ValidationError },
        ];

        fc.assert(
            fc.property(
                fc.integer({ min: 0, max: cases.length - 1 }),
                fc.option(fc.string(), { nil: undefined }),
                fc.option(fc.string(), { nil: undefined }),
                (idx, constraint, detail) => {
                    const { code, status, cls } = cases[idx];
                    const err = pgError(code, { constraint, detail });
                    const mapped = mapDatabaseError(err);

                    // Consistency: same SQLSTATE → same status + same error class, every time.
                    expect(mapped.statusCode).toBe(status);
                    expect(mapped).toBeInstanceOf(cls);
                    // The mapped error always carries a non-empty, human-readable message.
                    expect(typeof mapped.message).toBe("string");
                    expect(mapped.message.length).toBeGreaterThan(0);
                },
            ),
            { numRuns: 100 },
        );
    });

    /**
     * **Validates: Requirement 14.2**
     *
     * Property: A unique-constraint violation SHALL always return 409 Conflict with a
     * descriptive message identifying the conflicting field — for every known constraint name
     * AND for unknown constraint names (graceful fallback).
     */
    it("returns 409 with a descriptive message for any unique violation (100 iterations)", () => {
        const knownConstraints = Object.keys({
            users_email_lower_uidx: 1,
            projects_code_uk: 1,
            projects_name_lower_uidx: 1,
            bugs_bug_id_uk: 1,
            test_cases_tc_id_uk: 1,
            test_cases_dedup_uidx: 1,
        });

        fc.assert(
            fc.property(
                fc.oneof(
                    fc.constantFrom(...knownConstraints),
                    fc.string({ minLength: 1 }),
                ),
                (constraint) => {
                    const err = pgError(PgSqlState.UNIQUE_VIOLATION, { constraint });
                    const mapped = mapDatabaseError(err);

                    expect(mapped).toBeInstanceOf(ConflictError);
                    expect(mapped.statusCode).toBe(409);
                    // Descriptive: the message is never empty and never the raw SQLSTATE.
                    expect(mapped.message.length).toBeGreaterThan(0);
                    expect(mapped.message).not.toContain("23505");
                },
            ),
            { numRuns: 100 },
        );
    });

    /**
     * **Validates: Requirement 14.5**
     *
     * Property: Already-typed AppErrors pass through UNCHANGED — the mapper never downgrades
     * or re-wraps a domain error a service deliberately threw.
     */
    it("passes already-typed AppErrors through unchanged (100 iterations)", () => {
        const samples = [
            new NotFoundError("Project not found"),
            new ConflictError("A project with that name already exists"),
            new ValidationError("Invalid payload"),
            new AppError("boom", 418, "TEAPOT"),
        ];

        fc.assert(
            fc.property(fc.integer({ min: 0, max: samples.length - 1 }), (idx) => {
                const original = samples[idx];
                const mapped = mapDatabaseError(original);
                expect(mapped).toBe(original); // identity — same instance
                expect(mapped.statusCode).toBe(original.statusCode);
                expect(mapped.message).toBe(original.message);
            }),
            { numRuns: 100 },
        );
    });

    /**
     * **Validates: Requirement 14.6**
     *
     * Property: Unknown / non-database errors NEVER leak internal details to the client —
     * they collapse to a generic 500 "Internal Server Error", regardless of the message.
     * (Friendly "not found"/"already exists" messages are the only exceptions preserved.)
     */
    it("never leaks unknown error internals (100 iterations)", () => {
        fc.assert(
            fc.property(fc.string({ minLength: 0, maxLength: 200 }), (msg) => {
                const mapped = mapDatabaseError(new Error(msg));
                if (/not found/i.test(msg)) {
                    expect(mapped).toBeInstanceOf(NotFoundError);
                } else if (/already exists/i.test(msg)) {
                    expect(mapped).toBeInstanceOf(ConflictError);
                } else {
                    // Generic — the raw message must NOT be forwarded.
                    expect(mapped.statusCode).toBe(500);
                    expect(mapped.message).toBe("Internal Server Error");
                }
            }),
            { numRuns: 100 },
        );
    });

    /**
     * Property: `isDatabaseError` correctly distinguishes pg errors from everything else,
     * so the mapper's guard is reliable across arbitrary thrown values.
     */
    it("isDatabaseError reliably classifies thrown values (100 iterations)", () => {
        fc.assert(
            fc.property(
                fc.oneof(
                    fc.record({
                        kind: fc.constant("pg") as fc.Arbitrary<"pg">,
                        code: fc.stringMatching(/^[0-9A-Z]{5}$/),
                    }),
                    fc.record({
                        kind: fc.constant("plain") as fc.Arbitrary<"plain">,
                        msg: fc.string(),
                    }),
                    fc.record({ kind: fc.constant("nullish") as fc.Arbitrary<"nullish"> }),
                ),
                (v) => {
                    if (v.kind === "pg") {
                        const e = pgError(v.code);
                        expect(isDatabaseError(e)).toBe(true);
                    } else if (v.kind === "plain") {
                        expect(isDatabaseError(new Error(v.msg))).toBe(false);
                    } else {
                        expect(isDatabaseError(null)).toBe(false);
                        expect(isDatabaseError(undefined)).toBe(false);
                        expect(isDatabaseError({})).toBe(false);
                    }
                },
            ),
            { numRuns: 100 },
        );
    });
});

/* ================================================================== *
 * Property 1: Audit Field Population on Creation                      *
 * ================================================================== */

describe("**Feature: postgresql-persistence, Property 1: Audit Field Population on Creation**", () => {
    /**
     * **Validates: Requirement 3.2**
     *
     * Property: When creating an entity, the repository SHALL populate createdAt, createdBy,
     * and version, and updatedAt SHALL equal createdAt.
     */
    it("populates createdAt == updatedAt, version = 1, and resolves createdBy (100 iterations)", () => {
        fc.assert(
            fc.property(
                fc.oneof(fc.constant(UUID_SAMPLE), fc.string({ minLength: 1 })),
                (actor) => {
                    const audit = auditOnCreate({ createdBy: actor });

                    expect(audit.version).toBe(1);
                    expect(typeof audit.createdAt).toBe("string");
                    expect(typeof audit.updatedAt).toBe("string");
                    // updatedAt == createdAt on creation.
                    expect(audit.updatedAt).toBe(audit.createdAt);
                    // A valid uuid actor is preserved; anything else resolves to null.
                    if (actor === UUID_SAMPLE) {
                        expect(audit.createdBy).toBe(UUID_SAMPLE);
                        expect(audit.updatedBy).toBe(UUID_SAMPLE);
                    } else {
                        expect(audit.createdBy).toBeNull();
                    }
                },
            ),
            { numRuns: 100 },
        );
    });
});

/* ================================================================== *
 * Property 2: Audit Field Updates on Modification                     *
 * ================================================================== */

describe("**Feature: postgresql-persistence, Property 2: Audit Field Updates on Modification**", () => {
    /**
     * **Validates: Requirement 3.3**
     *
     * Property: When updating an entity, the repository SHALL update updatedAt and updatedBy
     * while NEVER including createdAt, createdBy, or version in the update payload (those are
     * immutable after creation; version is bumped atomically elsewhere).
     */
    it("sets updatedAt/updatedBy and never touches createdAt/createdBy/version (100 iterations)", () => {
        fc.assert(
            fc.property(fc.oneof(fc.constant(UUID_SAMPLE), fc.constant("QA Team")), (actor) => {
                const audit = auditOnUpdate({ updatedBy: actor });

                // updatedAt is always present.
                expect(typeof audit.updatedAt).toBe("string");
                // Immutable fields are NEVER part of an update payload.
                expect(audit).not.toHaveProperty("createdAt");
                expect(audit).not.toHaveProperty("createdBy");
                expect(audit).not.toHaveProperty("version");
                // updatedBy resolves like the actor resolver.
                expect(audit.updatedBy).toBe(actor === UUID_SAMPLE ? UUID_SAMPLE : null);
            }),
            { numRuns: 100 },
        );
    });
});
