/**
 * Database Schema — AI QA Copilot (PostgreSQL target)
 *
 * Single source of truth for the persistence layer, expressed with Drizzle ORM. This is the executable
 * form of the design in `docs/postgresql-migration/03-postgresql-schema-design.md`.
 *
 * Conventions (see `docs/database-planning.md` + Deliverable 3):
 * - Primary keys:  `uuid DEFAULT gen_random_uuid()` (core in PG13+; no pgcrypto required).
 * - Timestamps:    `timestamptz`, `mode: 'string'` so rows yield ISO strings (matches the camelCase domain).
 * - Audit fields:  `created_at`/`updated_at`/`created_by`/`updated_by` on every data table; the `*_id`
 *                  audit columns are FKs to `users.id` (declared inline via the lazy reference callback).
 * - Concurrency:   `version integer` (optimistic lock); repositories bump it in each UPDATE.
 * - Soft delete:   `deleted_at timestamptz` (null = live). Distinct from projects' `status = 'archived'`.
 * - Enum labels:   lowercase snake; the repository maps them to the display strings the UI uses today.
 *
 * NOTE: `updated_at`/`version` are bumped by the repository in each UPDATE (needed for optimistic
 * locking via `WHERE version = $2`), so no DB trigger is required.
 *
 * Status: PLANNING/SCAFFOLD — nothing depends on this yet (Migration Roadmap Step 1).
 */

import { sql } from "drizzle-orm";
import {
    AnyPgColumn,
    boolean,
    check,
    date,
    inet,
    index,
    integer,
    jsonb,
    numeric,
    pgEnum,
    pgTable,
    primaryKey,
    text,
    timestamp,
    unique,
    uniqueIndex,
    uuid,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ *
 * Enum types (lowercase labels; repository maps to display strings)   *
 * ------------------------------------------------------------------ */

export const userRole = pgEnum("user_role", ["admin", "qa_lead", "qa_engineer"]);
export const accountStatus = pgEnum("account_status", [
    "active",
    "disabled",
    "pending_approval",
    "rejected",
    "suspended",
]);
export const projectStatus = pgEnum("project_status", ["active", "archived"]);
export const projectType = pgEnum("project_type", [
    "web_application",
    "mobile_application",
    "api",
    "microservices",
    "other",
]);
export const bugLayer = pgEnum("bug_layer", [
    "frontend",
    "backend",
    "integration",
    "mobile",
    "infrastructure",
]);
export const bugSeverity = pgEnum("bug_severity", ["critical", "high", "medium", "low"]);
export const bugPriority = pgEnum("bug_priority", ["p1", "p2", "p3", "p4"]);
export const bugStatus = pgEnum("bug_status", [
    "open",
    "assigned",
    "in_progress",
    "fixed",
    "ready_for_qa",
    "verified",
    "closed",
    "reopened",
]);
export const testcaseType = pgEnum("testcase_type", [
    "functional",
    "negative",
    "edge",
    "security",
    "boundary",
    "scenario",
    "ui",
    "validation",
    "api",
    "permission",
    "workflow",
    "integration",
    "data_integrity",
    "performance",
    "accessibility",
]);
export const testcasePriority = pgEnum("testcase_priority", ["critical", "high", "medium", "low"]);
export const testcaseStatus = pgEnum("testcase_status", [
    "not_executed",
    "passed",
    "failed",
    "blocked",
    "skipped",
]);
export const contentSource = pgEnum("content_source", ["ai", "manual", "imported", "seeded"]);
export const generationStatus = pgEnum("generation_status", ["running", "succeeded", "failed"]);
export const inputMethod = pgEnum("input_method", ["description", "structured", "log"]);

/* ------------------------------------------------------------------ *
 * Identity / RBAC                                                     *
 * ------------------------------------------------------------------ */

export const users = pgTable(
    "users",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        email: text("email").notNull(),
        name: text("name").notNull(),
        role: userRole("role").notNull().default("qa_engineer"),
        status: accountStatus("status").notNull().default("active"),
        passwordHash: text("password_hash").notNull(),
        // Optional admin-provided reason captured on rejection (cleared on approval/activation).
        rejectionReason: text("rejection_reason"),
        // The role a registrant requested (nullable; admin may assign a different role at approval).
        requestedRole: userRole("requested_role"),
        lastLoginAt: timestamp("last_login_at", { withTimezone: true, mode: "string" }),
        // self-references (who created/updated this user) — `(): AnyPgColumn` breaks the circular
        // type inference that TS otherwise complains about for self-referencing FKs.
        createdBy: uuid("created_by").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
        updatedBy: uuid("updated_by").references((): AnyPgColumn => users.id, { onDelete: "set null" }),
        createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
            .defaultNow()
            .notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
            .defaultNow()
            .notNull(),
        version: integer("version").notNull().default(1),
        deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "string" }),
    },
    (t) => [
        check("users_version_check", sql`${t.version} > 0`),
        // case-insensitive, unique among live users
        uniqueIndex("users_email_lower_uidx")
            .on(sql`lower(${t.email})`)
            .where(sql`${t.deletedAt} IS NULL`),
    ],
);

export const projects = pgTable(
    "projects",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        code: text("code").notNull(), // e.g. 'LOGE' (normalized UPPERCASE)
        name: text("name").notNull(),
        description: text("description").notNull().default(""),
        type: projectType("type").notNull().default("web_application"),
        status: projectStatus("status").notNull().default("active"),
        createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
        updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
        createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
            .defaultNow()
            .notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
            .defaultNow()
            .notNull(),
        version: integer("version").notNull().default(1),
        deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "string" }),
    },
    (t) => [
        check("projects_version_check", sql`${t.version} > 0`),
        unique("projects_code_uk").on(t.code),
        uniqueIndex("projects_name_lower_uidx")
            .on(sql`lower(${t.name})`)
            .where(sql`${t.deletedAt} IS NULL`),
        index("projects_status_idx").on(t.status).where(sql`${t.deletedAt} IS NULL`),
    ],
);

export const userProjectAssignments = pgTable(
    "user_project_assignments",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        projectId: uuid("project_id")
            .notNull()
            .references(() => projects.id, { onDelete: "cascade" }),
        projectRole: userRole("project_role").notNull(),
        createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
        updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
        createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
            .defaultNow()
            .notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
            .defaultNow()
            .notNull(),
        version: integer("version").notNull().default(1),
        deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "string" }),
    },
    (t) => [
        check("upa_version_check", sql`${t.version} > 0`),
        unique("upa_user_project_uk").on(t.userId, t.projectId),
        index("upa_user_idx").on(t.userId),
        index("upa_project_idx").on(t.projectId),
    ],
);

export const refreshTokens = pgTable(
    "refresh_tokens",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        tokenHash: text("token_hash").notNull(),
        expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }).notNull(),
        revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "string" }),
        userAgent: text("user_agent"),
        ip: inet("ip"),
        createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
            .defaultNow()
            .notNull(),
    },
    (t) => [
        uniqueIndex("refresh_tokens_token_hash_uidx").on(t.tokenHash),
        index("refresh_tokens_user_idx").on(t.userId),
    ],
);

/* ------------------------------------------------------------------ *
 * AI provenance                                                       *
 * ------------------------------------------------------------------ */

export const generations = pgTable(
    "generations",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
        module: text("module"),
        subModule: text("sub_module"),
        feature: text("feature"),
        inputHash: text("input_hash"),
        provider: text("provider"),
        model: text("model"),
        agents: text("agents").array().notNull().default([]),
        rawCaseCount: integer("raw_case_count"),
        mergedCaseCount: integer("merged_case_count"),
        duplicatesRemoved: integer("duplicates_removed"),
        coverageScore: numeric("coverage_score", { precision: 5, scale: 2 }),
        status: generationStatus("status").notNull().default("running"),
        error: text("error"),
        durationMs: integer("duration_ms"),
        createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
        createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
            .defaultNow()
            .notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
            .defaultNow()
            .notNull(),
    },
    (t) => [
        uniqueIndex("generations_input_hash_uidx")
            .on(t.inputHash)
            .where(sql`${t.inputHash} IS NOT NULL`),
        index("generations_project_idx").on(t.projectId),
    ],
);

/* ------------------------------------------------------------------ *
 * Core domain: bugs, test_cases                                       *
 * ------------------------------------------------------------------ */

export const bugs = pgTable(
    "bugs",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        bugId: text("bug_id").notNull(), // 'BUG-512627001' (immutable business key)
        projectId: uuid("project_id")
            .notNull()
            .references(() => projects.id, { onDelete: "restrict" }),
        title: text("title").notNull(),
        description: text("description").notNull().default(""),
        module: text("module").notNull().default(""),
        layer: bugLayer("layer").notNull(),
        severity: bugSeverity("severity").notNull(),
        priority: bugPriority("priority").notNull(),
        status: bugStatus("status").notNull().default("open"),
        environment: text("environment").notNull().default(""),
        precondition: text("precondition").notNull().default(""),
        currentBehavior: text("current_behavior").array().notNull().default([]),
        stepsToReproduce: text("steps_to_reproduce").array().notNull().default([]),
        expectedResult: text("expected_result").notNull().default(""),
        actualResult: text("actual_result").notNull().default(""),
        impact: text("impact").notNull().default(""),
        reporterId: uuid("reporter_id").references(() => users.id, { onDelete: "set null" }),
        assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
        // AI metadata
        possibleRootCause: text("possible_root_cause"),
        suggestedFix: text("suggested_fix"),
        similarBugs: text("similar_bugs").array().notNull().default([]),
        missingInfo: text("missing_info").array().notNull().default([]),
        tags: text("tags").array().notNull().default([]),
        aiConfidence: numeric("ai_confidence", { precision: 5, scale: 2 }),
        source: contentSource("source").notNull().default("manual"),
        generationId: uuid("generation_id").references(() => generations.id, {
            onDelete: "set null",
        }),
        createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
        updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
        createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
            .defaultNow()
            .notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
            .defaultNow()
            .notNull(),
        version: integer("version").notNull().default(1),
        deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "string" }),
    },
    (t) => [
        check("bugs_version_check", sql`${t.version} > 0`),
        unique("bugs_bug_id_uk").on(t.bugId),
        index("bugs_project_idx").on(t.projectId).where(sql`${t.deletedAt} IS NULL`),
        index("bugs_project_status_idx")
            .on(t.projectId, t.status)
            .where(sql`${t.deletedAt} IS NULL`),
        index("bugs_severity_idx").on(t.severity).where(sql`${t.deletedAt} IS NULL`),
        index("bugs_priority_idx").on(t.priority).where(sql`${t.deletedAt} IS NULL`),
        index("bugs_layer_idx").on(t.layer).where(sql`${t.deletedAt} IS NULL`),
        index("bugs_created_idx").on(t.createdAt).where(sql`${t.deletedAt} IS NULL`),
    ],
);

export const testCases = pgTable(
    "test_cases",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        tcId: text("tc_id").notNull(), // 'TC-0001' (immutable business key)
        projectId: uuid("project_id")
            .notNull()
            .references(() => projects.id, { onDelete: "restrict" }),
        module: text("module").notNull(),
        subModule: text("sub_module").notNull().default(""),
        name: text("name").notNull(),
        description: text("description").notNull().default(""),
        type: testcaseType("type").notNull().default("functional"),
        priority: testcasePriority("priority").notNull().default("medium"),
        testSteps: text("test_steps").array().notNull().default([]),
        expectedResult: text("expected_result").notNull().default(""),
        testStatus: testcaseStatus("test_status").notNull().default("not_executed"),
        actualResult: text("actual_result").notNull().default(""),
        assignedToId: uuid("assigned_to_id").references(() => users.id, {
            onDelete: "set null",
        }),
        executionDate: date("execution_date", { mode: "string" }),
        comments: text("comments").notNull().default(""),
        tags: text("tags").array().notNull().default([]),
        source: contentSource("source").notNull().default("manual"),
        // Stable display order (preserves Excel sheet/row order on import; creation order otherwise).
        sortOrder: integer("sort_order").notNull().default(0),
        generationId: uuid("generation_id").references(() => generations.id, {
            onDelete: "set null",
        }),
        createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
        updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
        createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
            .defaultNow()
            .notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
            .defaultNow()
            .notNull(),
        version: integer("version").notNull().default(1),
        deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "string" }),
    },
    (t) => [
        check("test_cases_version_check", sql`${t.version} > 0`),
        unique("test_cases_tc_id_uk").on(t.tcId),
        // dedup rule from today's bulkSave: (project, module, name) unique among live rows
        uniqueIndex("test_cases_dedup_uidx")
            .on(t.projectId, t.module, t.name)
            .where(sql`${t.deletedAt} IS NULL`),
        index("test_cases_project_idx").on(t.projectId).where(sql`${t.deletedAt} IS NULL`),
        index("test_cases_project_status_idx")
            .on(t.projectId, t.testStatus)
            .where(sql`${t.deletedAt} IS NULL`),
        index("test_cases_priority_idx").on(t.priority).where(sql`${t.deletedAt} IS NULL`),
        index("test_cases_type_idx").on(t.type).where(sql`${t.deletedAt} IS NULL`),
        index("test_cases_created_idx").on(t.createdAt).where(sql`${t.deletedAt} IS NULL`),
        index("test_cases_sort_order_idx").on(t.sortOrder).where(sql`${t.deletedAt} IS NULL`),
    ],
);

export const testCaseBugs = pgTable(
    "test_case_bugs",
    {
        testCaseId: uuid("test_case_id")
            .notNull()
            .references(() => testCases.id, { onDelete: "cascade" }),
        bugId: uuid("bug_id")
            .notNull()
            .references(() => bugs.id, { onDelete: "cascade" }),
        createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
            .defaultNow()
            .notNull(),
    },
    (t) => [primaryKey({ columns: [t.testCaseId, t.bugId] }), index("test_case_bugs_bug_idx").on(t.bugId)],
);

/* ------------------------------------------------------------------ *
 * History (append-only field-level diffs)                             *
 * ------------------------------------------------------------------ */

export const projectHistory = pgTable(
    "project_history",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        projectId: uuid("project_id")
            .notNull()
            .references(() => projects.id, { onDelete: "cascade" }),
        changedField: text("changed_field").notNull(),
        oldValue: text("old_value"),
        newValue: text("new_value"),
        changedBy: uuid("changed_by").references(() => users.id, { onDelete: "set null" }),
        changedAt: timestamp("changed_at", { withTimezone: true, mode: "string" })
            .defaultNow()
            .notNull(),
    },
    (t) => [index("project_history_project_idx").on(t.projectId, t.changedAt)],
);

export const bugHistory = pgTable(
    "bug_history",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        bugId: uuid("bug_id") // FK to bugs.id (UUID); repository maps to display bug_id in responses
            .notNull()
            .references(() => bugs.id, { onDelete: "cascade" }),
        changedField: text("changed_field").notNull(),
        oldValue: text("old_value"),
        newValue: text("new_value"),
        changedBy: uuid("changed_by").references(() => users.id, { onDelete: "set null" }),
        changedAt: timestamp("changed_at", { withTimezone: true, mode: "string" })
            .defaultNow()
            .notNull(),
    },
    (t) => [index("bug_history_bug_idx").on(t.bugId, t.changedAt)],
);

export const testCaseHistory = pgTable(
    "test_case_history",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        testCaseId: uuid("test_case_id")
            .notNull()
            .references(() => testCases.id, { onDelete: "cascade" }),
        changedField: text("changed_field").notNull(),
        oldValue: text("old_value"),
        newValue: text("new_value"),
        changedBy: uuid("changed_by").references(() => users.id, { onDelete: "set null" }),
        changedAt: timestamp("changed_at", { withTimezone: true, mode: "string" })
            .defaultNow()
            .notNull(),
    },
    (t) => [index("test_case_history_tc_idx").on(t.testCaseId, t.changedAt)],
);

/* ------------------------------------------------------------------ *
 * Unified audit feed                                                  *
 * ------------------------------------------------------------------ */

export const activityLog = pgTable(
    "activity_log",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
        action: text("action").notNull(),
        entityType: text("entity_type").notNull(),
        entityId: uuid("entity_id"),
        projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
        metadata: jsonb("metadata").notNull().default({}),
        createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
            .defaultNow()
            .notNull(),
    },
    (t) => [
        index("activity_log_created_idx").on(t.createdAt),
        index("activity_log_project_idx").on(t.projectId, t.createdAt),
        index("activity_log_actor_idx").on(t.actorId, t.createdAt),
        index("activity_log_entity_idx").on(t.entityType, t.entityId),
    ],
);

/* ------------------------------------------------------------------ *
 * Reports (future stub — reserved)                                    *
 * ------------------------------------------------------------------ */

export const reports = pgTable(
    "reports",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        projectId: uuid("project_id")
            .notNull()
            .references(() => projects.id, { onDelete: "cascade" }),
        name: text("name").notNull(),
        type: text("type").notNull(),
        params: jsonb("params").notNull().default({}),
        status: text("status").notNull().default("pending"),
        createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
        updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
        createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
            .defaultNow()
            .notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
            .defaultNow()
            .notNull(),
        version: integer("version").notNull().default(1),
        deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "string" }),
    },
    (t) => [check("reports_version_check", sql`${t.version} > 0`)],
);

/* ------------------------------------------------------------------ *
 * Project Estimation                                                  *
 *                                                                     *
 * Hierarchy: Project → Version/Release → Module → Engineer → Estimation.
 * - `project_versions`: optional release/version grouping (nullable where used).
 * - `estimation_modules`: the QA module being estimated (denormalized `project_id` for RBAC/queries).
 * - `module_assignments`: Module → Engineer + per-engineer daily capacity (hours/day).
 * - `module_estimations`: an engineer's estimate of an assigned module + approval status.
 * - `estimation_review_events` (append-only) + `estimation_history` (field-level diffs): audit feeds.
 *                                                                     *
 * Project Total Effort = sum of module_estimations where is_final_approved AND status='approved'.
 * Team Capacity (hours/day) = sum of each DISTINCT engineer's max assignment daily_capacity_hours.
 * Metrics are computed server-side in `estimation-math.ts` (see docs/reporting-rules.md).
 * ------------------------------------------------------------------ */

export const projectVersionStatus = pgEnum("project_version_status", ["draft", "active", "locked"]);
export const estimationStatus = pgEnum("estimation_status", [
    "draft",
    "submitted",
    "under_review",
    "approved",
    "revision_requested",
    "rejected",
]);
export const complexityLevel = pgEnum("complexity_level", ["low", "medium", "high", "critical"]);
export const riskLevel = pgEnum("risk_level", ["low", "medium", "high"]);

export const projectVersions = pgTable(
    "project_versions",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        projectId: uuid("project_id")
            .notNull()
            .references(() => projects.id, { onDelete: "cascade" }),
        name: text("name").notNull(),
        code: text("code"),
        status: projectVersionStatus("status").notNull().default("draft"),
        targetDate: date("target_date", { mode: "string" }),
        notes: text("notes").notNull().default(""),
        createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
        updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
        createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
            .defaultNow()
            .notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
            .defaultNow()
            .notNull(),
        version: integer("version").notNull().default(1),
        deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "string" }),
    },
    (t) => [
        check("project_versions_version_check", sql`${t.version} > 0`),
        // (project, name) unique among live versions.
        uniqueIndex("project_versions_name_lower_uidx")
            .on(t.projectId, sql`lower(${t.name})`)
            .where(sql`${t.deletedAt} IS NULL`),
        index("project_versions_project_idx").on(t.projectId).where(sql`${t.deletedAt} IS NULL`),
    ],
);

export const estimationModules = pgTable(
    "estimation_modules",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        // Nullable → version-less estimation allowed (UI groups these under an "Unversioned" bucket).
        versionId: uuid("version_id").references(() => projectVersions.id, { onDelete: "cascade" }),
        projectId: uuid("project_id")
            .notNull()
            .references(() => projects.id, { onDelete: "cascade" }),
        name: text("name").notNull(),
        description: text("description").notNull().default(""),
        sortOrder: integer("sort_order").notNull().default(0),
        createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
        updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
        createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
            .defaultNow()
            .notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
            .defaultNow()
            .notNull(),
        version: integer("version").notNull().default(1),
        deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "string" }),
    },
    (t) => [
        check("estimation_modules_version_check", sql`${t.version} > 0`),
        index("estimation_modules_project_idx").on(t.projectId).where(sql`${t.deletedAt} IS NULL`),
        index("estimation_modules_version_idx").on(t.versionId).where(sql`${t.deletedAt} IS NULL`),
    ],
);

export const moduleAssignments = pgTable(
    "module_assignments",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        moduleId: uuid("module_id")
            .notNull()
            .references(() => estimationModules.id, { onDelete: "cascade" }),
        engineerId: uuid("engineer_id")
            .notNull()
            .references(() => users.id, { onDelete: "set null" }),
        // Denormalized for auth-off usability (engineer display name) and the engineer-breakdown view.
        engineerName: text("engineer_name").notNull().default(""),
        projectId: uuid("project_id")
            .notNull()
            .references(() => projects.id, { onDelete: "cascade" }),
        dailyCapacityHours: numeric("daily_capacity_hours", { precision: 5, scale: 2 })
            .notNull()
            .default("8"),
        role: userRole("role").notNull().default("qa_engineer"),
        createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
        updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
        createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
            .defaultNow()
            .notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
            .defaultNow()
            .notNull(),
        version: integer("version").notNull().default(1),
        deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "string" }),
    },
    (t) => [
        check("module_assignments_version_check", sql`${t.version} > 0`),
        // (module, engineer) unique among live assignments (allows re-assignment after soft delete).
        uniqueIndex("module_assignments_module_engineer_uidx")
            .on(t.moduleId, t.engineerId)
            .where(sql`${t.deletedAt} IS NULL`),
        index("module_assignments_engineer_idx").on(t.engineerId).where(sql`${t.deletedAt} IS NULL`),
        index("module_assignments_module_idx").on(t.moduleId).where(sql`${t.deletedAt} IS NULL`),
        index("module_assignments_project_idx").on(t.projectId).where(sql`${t.deletedAt} IS NULL`),
    ],
);

export const moduleEstimations = pgTable(
    "module_estimations",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        assignmentId: uuid("assignment_id").references(() => moduleAssignments.id, {
            onDelete: "set null",
        }),
        moduleId: uuid("module_id")
            .notNull()
            .references(() => estimationModules.id, { onDelete: "cascade" }),
        engineerId: uuid("engineer_id")
            .notNull()
            .references(() => users.id, { onDelete: "set null" }),
        engineerName: text("engineer_name").notNull().default(""),
        projectId: uuid("project_id")
            .notNull()
            .references(() => projects.id, { onDelete: "cascade" }),
        // Estimate
        testCaseCount: integer("test_case_count"),
        estimatedHours: numeric("estimated_hours", { precision: 6, scale: 2 }),
        complexity: complexityLevel("complexity"),
        riskLevel: riskLevel("risk_level"),
        assumptions: text("assumptions").notNull().default(""),
        dependencies: text("dependencies").array().notNull().default([]),
        notes: text("notes").notNull().default(""),
        // Workflow
        status: estimationStatus("status").notNull().default("draft"),
        reviewerId: uuid("reviewer_id").references(() => users.id, { onDelete: "set null" }),
        reviewComment: text("review_comment"),
        reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: "string" }),
        // Lead's final selection (exactly one approved estimate per module)
        isFinalApproved: boolean("is_final_approved").notNull().default(false),
        createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
        updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
        createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
            .defaultNow()
            .notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
            .defaultNow()
            .notNull(),
        version: integer("version").notNull().default(1),
        deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "string" }),
    },
    (t) => [
        check("module_estimations_version_check", sql`${t.version} > 0`),
        index("module_estimations_project_status_idx")
            .on(t.projectId, t.status)
            .where(sql`${t.deletedAt} IS NULL`),
        index("module_estimations_module_idx").on(t.moduleId).where(sql`${t.deletedAt} IS NULL`),
        index("module_estimations_engineer_status_idx")
            .on(t.engineerId, t.status)
            .where(sql`${t.deletedAt} IS NULL`),
        index("module_estimations_final_idx")
            .on(t.moduleId)
            .where(sql`${t.isFinalApproved} AND ${t.deletedAt} IS NULL`),
    ],
);

// Append-only review events (one per status transition) — feeds the Review History + Audit Log tabs.
export const estimationReviewEvents = pgTable(
    "estimation_review_events",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        estimationId: uuid("estimation_id")
            .notNull()
            .references(() => moduleEstimations.id, { onDelete: "cascade" }),
        fromStatus: text("from_status"),
        toStatus: text("to_status"),
        action: text("action").notNull(),
        actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
        actorName: text("actor_name"),
        comment: text("comment"),
        createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
            .defaultNow()
            .notNull(),
    },
    (t) => [index("estimation_review_events_estimation_idx").on(t.estimationId, t.createdAt)],
);

// Field-level edit history (mirrors project_history / bug_history).
export const estimationHistory = pgTable(
    "estimation_history",
    {
        id: uuid("id").defaultRandom().primaryKey(),
        estimationId: uuid("estimation_id")
            .notNull()
            .references(() => moduleEstimations.id, { onDelete: "cascade" }),
        changedField: text("changed_field").notNull(),
        oldValue: text("old_value"),
        newValue: text("new_value"),
        changedBy: uuid("changed_by").references(() => users.id, { onDelete: "set null" }),
        changedAt: timestamp("changed_at", { withTimezone: true, mode: "string" })
            .defaultNow()
            .notNull(),
    },
    (t) => [index("estimation_history_estimation_idx").on(t.estimationId, t.changedAt)],
);
