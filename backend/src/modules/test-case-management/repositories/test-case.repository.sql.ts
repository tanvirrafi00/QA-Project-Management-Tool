/**
 * SQL-backed Test Case Repository (Drizzle / PostgreSQL).
 *
 * Same async interface as the in-memory repo; selected via `USE_DB_TEST_CASES=true`. Notable mappings:
 * - `type` enum labels already equal the domain display strings (no conversion).
 * - `priority`/`test_status` lowercase DB labels ↔ display strings.
 * - `projectName` → project_id FK on write, joined back on read.
 * - `assignedTo` → assigned_to_id (uuid); reads left-join `users` to recover the display name. A non-uuid
 *   value supplied on write is dropped (null) — assignment goes through the project-members dropdown (uuid).
 * - `relatedBugs` ↔ the normalized `test_case_bugs` join table (display bug-id ↔ bugs.id).
 * - analytics via parallel `GROUP BY`; module tree via grouped module+sub_module.
 *
 * Migration Roadmap Step 3.3.
 */

import { and, asc, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, or, sql, sum } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../../../shared/db";
import { bugs, projects, testCaseBugs, testCaseHistory, testCases, users } from "../../../shared/db/schema";
import logger from "../../../shared/logger";
import activityLogRepository from "../../../shared/db/repositories/activity-log.repository";
import type {
    BulkSaveResult,
    BulkSaveTestCaseInput,
    BulkUpdateInput,
    ModuleNode,
    SaveTestCaseInput,
    TestCase,
    TestCaseAnalytics,
    TestCaseFilter,
    TestCaseHistoryEntry,
    TestCasePriority,
    TestCaseStatus,
    TestCaseType,
    UpdateTestCaseInput,
} from "../types";

type TcRow = typeof testCases.$inferSelect;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// `users` aliased so rowToTestCase can recover the assignee display name from the assigned_to_id FK.
const assigneeUser = alias(users, "tc_assignee");

/* ---- enum display ↔ lowercase DB maps (type is 1:1) ---- */

const PRIORITY_TO_DB: Record<TestCasePriority, string> = { Critical: "critical", High: "high", Medium: "medium", Low: "low" };
const PRIORITY_FROM_DB: Record<string, TestCasePriority> = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };
const STATUS_TO_DB: Record<TestCaseStatus, string> = {
    "Not Executed": "not_executed", Passed: "passed", Failed: "failed", Blocked: "blocked", Skipped: "skipped",
};
const STATUS_FROM_DB: Record<string, TestCaseStatus> = {
    not_executed: "Not Executed", passed: "Passed", failed: "Failed", blocked: "Blocked", skipped: "Skipped",
};
const EXECUTED_DB = ["passed", "failed", "blocked", "skipped"];

function resolveActor(actor?: string | null): string | null {
    return actor && UUID_RE.test(actor) ? actor : null;
}
function todayDate(): string {
    return new Date().toISOString().slice(0, 10);
}

function rowToTestCase(row: TcRow, projectName: string | null, relatedBugIds: string[], assigneeName?: string | null): TestCase {
    return {
        id: row.id,
        tcId: row.tcId,
        projectName: projectName ?? "",
        module: row.module,
        subModule: row.subModule,
        name: row.name,
        description: row.description,
        type: row.type as TestCaseType,
        priority: PRIORITY_FROM_DB[row.priority] ?? "Medium",
        testSteps: row.testSteps,
        expectedResult: row.expectedResult,
        testStatus: STATUS_FROM_DB[row.testStatus] ?? "Not Executed",
        actualResult: row.actualResult,
        assignedTo: assigneeName || "Unassigned",
        assignedToId: row.assignedToId ?? undefined,
        executionDate: row.executionDate,
        comments: row.comments,
        relatedBugs: relatedBugIds,
        tags: row.tags,
        sortOrder: row.sortOrder,
        source: (row.source ?? "manual") as 'manual' | 'imported',
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        version: row.version,
    };
}

class SqlTestCaseRepository {
    /** Time-based id for interface parity; `save` uses the sequential `nextTcId`. */
    generateTcId(): string {
        return `TC-${Date.now().toString(36).toUpperCase().slice(-6)}`;
    }

    private async resolveProjectId(projectName: string): Promise<string | undefined> {
        const rows = await db
            .select({ id: projects.id })
            .from(projects)
            .where(and(eq(projects.name, projectName), isNull(projects.deletedAt)))
            .limit(1);
        return rows[0]?.id;
    }

    private async nextTcId(): Promise<string> {
        const rows = await db.select({ tcId: testCases.tcId }).from(testCases).orderBy(desc(testCases.tcId)).limit(1);
        const last = rows[0]?.tcId;
        const n = last ? parseInt(last.replace(/\D/g, ""), 10) || 0 : 0;
        return `TC-${String(n + 1).padStart(4, "0")}`;
    }

    /** Next stable display order = current max + 1 (preserves creation/sheet order). */
    private async nextSortOrder(): Promise<number> {
        const rows = await db.select({ m: sql<number>`max(${testCases.sortOrder})` }).from(testCases);
        return Number(rows[0]?.m ?? 0) + 1;
    }

    /** True when a live or soft-deleted row already uses this TC ID (global unique key). */
    private async tcIdExists(tcId: string): Promise<boolean> {
        const rows = await db.select({ id: testCases.id }).from(testCases).where(eq(testCases.tcId, tcId)).limit(1);
        return rows.length > 0;
    }

    /** Resolve a list of display bug-ids to {displayId: bugUuid}. */
    private async resolveBugIds(displayIds: string[]): Promise<Record<string, string>> {
        if (displayIds.length === 0) return {};
        const rows = await db
            .select({ bugId: bugs.bugId, id: bugs.id })
            .from(bugs)
            .where(inArray(bugs.bugId, displayIds));
        const out: Record<string, string> = {};
        for (const r of rows) out[r.bugId] = r.id;
        return out;
    }

    /** Fetch related-bug display ids for the given test-case uuids → {tcId: bugIdDisplay[]}. */
    private async relatedBugsByCase(caseIds: string[]): Promise<Record<string, string[]>> {
        if (caseIds.length === 0) return {};
        const rows = await db
            .select({ testCaseId: testCaseBugs.testCaseId, bugId: bugs.bugId })
            .from(testCaseBugs)
            .leftJoin(bugs, eq(testCaseBugs.bugId, bugs.id))
            .where(inArray(testCaseBugs.testCaseId, caseIds));
        const out: Record<string, string[]> = {};
        for (const r of rows) {
            if (!out[r.testCaseId]) out[r.testCaseId] = [];
            if (r.bugId) out[r.testCaseId].push(r.bugId);
        }
        return out;
    }

    async save(input: SaveTestCaseInput): Promise<TestCase> {
        const projectId = await this.resolveProjectId(input.projectName);
        if (!projectId) throw new Error(`Project "${input.projectName}" not found`);

        const relatedBugIds = input.relatedBugs ?? [];
        const resolvedBugs = await this.resolveBugIds(relatedBugIds);
        // Preserve an explicit TC ID (e.g. from an Excel import) when it is globally free;
        // otherwise fall back to the sequential generator so the unique constraint never fires.
        const tcId = input.tcId && !(await this.tcIdExists(input.tcId)) ? input.tcId : await this.nextTcId();
        const sortOrder = input.sortOrder ?? (await this.nextSortOrder());
        const source = (input.source ?? "manual") as TcRow["source"];

        const created = await db.transaction(async (tx) => {
            const [row] = await tx
                .insert(testCases)
                .values({
                    tcId,
                    projectId,
                    module: input.module,
                    subModule: input.subModule ?? "",
                    name: input.name,
                    description: input.description ?? "",
                    type: (input.type ?? "functional") as TcRow["type"],
                    priority: (PRIORITY_TO_DB[input.priority] ?? "medium") as TcRow["priority"],
                    testSteps: input.testSteps ?? [],
                    expectedResult: input.expectedResult ?? "",
                    testStatus: (STATUS_TO_DB[input.testStatus || "Not Executed"] ?? "not_executed") as TcRow["testStatus"],
                    actualResult: input.actualResult ?? "",
                    assignedToId: resolveActor(input.assignedTo),
                    executionDate: input.executionDate ?? null,
                    comments: input.comments ?? "",
                    tags: input.tags ?? [],
                    sortOrder,
                    source,
                })
                .returning();
            if (resolvedBugs && relatedBugIds.length) {
                const uuids = relatedBugIds.map((d) => resolvedBugs[d]).filter(Boolean) as string[];
                if (uuids.length) {
                    await tx.insert(testCaseBugs).values(uuids.map((u) => ({ testCaseId: row.id, bugId: u })));
                }
            }
            return row;
        });

        logger.info(`Test case saved: ${tcId} (${created.name})`);
        await activityLogRepository.log({
            action: "test_case.created",
            entityType: "test_case",
            entityId: created.id,
            projectId: created.projectId,
            metadata: { tcId },
        });
        return rowToTestCase(created, input.projectName, relatedBugIds.filter((d) => resolvedBugs[d]));
    }

    async bulkSave(input: BulkSaveTestCaseInput): Promise<BulkSaveResult> {
        const projectId = await this.resolveProjectId(input.projectName);
        if (!projectId) throw new Error(`Project "${input.projectName}" not found`);

        // Case-insensitive existing names for this project+module (mirrors in-memory dedup).
        const existingRows = await db
            .select({ name: testCases.name })
            .from(testCases)
            .where(
                and(
                    eq(testCases.projectId, projectId),
                    eq(testCases.module, input.module),
                    isNull(testCases.deletedAt),
                ),
            );
        const existingNames = new Set(existingRows.map((r) => r.name.toLowerCase().trim()));

        const saved: TestCase[] = [];
        let duplicatesSkipped = 0;
        for (const raw of input.testCases) {
            const name = (raw.name || raw.scenario || "Untitled Test Case").trim();
            const key = name.toLowerCase().trim();
            if (existingNames.has(key)) {
                duplicatesSkipped++;
                continue;
            }
            existingNames.add(key);
            try {
                const tc = await this.save({
                    projectName: input.projectName,
                    module: raw.module || input.module,
                    subModule: input.subModule,
                    name,
                    description: raw.scenario || "",
                    type: this.normalizeType(raw.type),
                    priority: this.normalizePriority(raw.priority),
                    testSteps: raw.steps || [],
                    expectedResult: raw.expectedResult || "",
                    tags: raw.tags || [],
                    ...(raw.tcId && { tcId: raw.tcId }),
                    ...(raw.sortOrder !== undefined && { sortOrder: raw.sortOrder }),
                    ...(raw.source && { source: raw.source }),
                });
                saved.push(tc);
            } catch (err) {
                logger.warn(`Bulk save skipped "${name}": ${(err as Error).message}`);
            }
        }
        logger.info(
            `Bulk saved ${saved.length} test cases to "${input.projectName}"/"${input.module}"` +
            (duplicatesSkipped > 0 ? ` (${duplicatesSkipped} duplicates skipped)` : ""),
        );
        return { saved, duplicatesSkipped, total: input.testCases.length };
    }

    async getById(idOrTcId: string): Promise<TestCase | undefined> {
        const isUuid = UUID_RE.test(idOrTcId);
        const rows = await db
            .select({ tc: testCases, projectName: projects.name, assigneeName: assigneeUser.name })
            .from(testCases)
            .leftJoin(projects, eq(testCases.projectId, projects.id))
            .leftJoin(assigneeUser, eq(testCases.assignedToId, assigneeUser.id))
            .where(and(isNull(testCases.deletedAt), isUuid ? eq(testCases.id, idOrTcId) : eq(testCases.tcId, idOrTcId)))
            .limit(1);
        const r = rows[0];
        if (!r) return undefined;
        const links = await this.relatedBugsByCase([r.tc.id]);
        return rowToTestCase(r.tc, r.projectName, links[r.tc.id] ?? [], r.assigneeName);
    }

    async getAll(filter?: TestCaseFilter): Promise<TestCase[]> {
        const conds = [isNull(testCases.deletedAt)];
        if (filter?.projectName) {
            const pid = await this.resolveProjectId(filter.projectName);
            if (!pid) return [];
            conds.push(eq(testCases.projectId, pid));
        }
        if (filter?.module) conds.push(eq(testCases.module, filter.module));
        if (filter?.subModule) conds.push(eq(testCases.subModule, filter.subModule));
        if (filter?.priority) conds.push(eq(testCases.priority, (PRIORITY_TO_DB[filter.priority] ?? filter.priority.toLowerCase()) as TcRow["priority"]));
        if (filter?.testStatus) conds.push(eq(testCases.testStatus, (STATUS_TO_DB[filter.testStatus] ?? "not_executed") as TcRow["testStatus"]));
        if (filter?.type) conds.push(eq(testCases.type, filter.type as TcRow["type"]));
        if (filter?.search) {
            const q = `%${filter.search.toLowerCase()}%`;
            conds.push(or(ilike(testCases.name, q), ilike(testCases.tcId, q), ilike(testCases.description, q), ilike(testCases.module, q))!);
        }
        const rows = await db
            .select({ tc: testCases, projectName: projects.name, assigneeName: assigneeUser.name })
            .from(testCases)
            .leftJoin(projects, eq(testCases.projectId, projects.id))
            .leftJoin(assigneeUser, eq(testCases.assignedToId, assigneeUser.id))
            .where(and(...conds))
            .orderBy(asc(testCases.sortOrder), desc(testCases.createdAt));
        if (rows.length === 0) return [];
        const links = await this.relatedBugsByCase(rows.map((r) => r.tc.id));
        return rows.map((r) => rowToTestCase(r.tc, r.projectName, links[r.tc.id] ?? [], r.assigneeName));
    }

    async update(
        idOrTcId: string,
        updates: UpdateTestCaseInput,
    ): Promise<{ testCase: TestCase; changes: string[] } | undefined> {
        const isUuid = UUID_RE.test(idOrTcId);
        const existingRows = await db
            .select({ tc: testCases, projectName: projects.name, assigneeName: assigneeUser.name })
            .from(testCases)
            .leftJoin(projects, eq(testCases.projectId, projects.id))
            .leftJoin(assigneeUser, eq(testCases.assignedToId, assigneeUser.id))
            .where(and(isNull(testCases.deletedAt), isUuid ? eq(testCases.id, idOrTcId) : eq(testCases.tcId, idOrTcId)))
            .limit(1);
        const existing = existingRows[0];
        if (!existing) return undefined;
        const tc = existing.tc;

        const changedBy = updates.changedBy || "QA Team";
        const now = new Date().toISOString();
        const set: Partial<typeof testCases.$inferInsert> = { updatedAt: now, updatedBy: resolveActor(changedBy) };
        const changes: string[] = [];
        const historyEntries: { field: string; oldVal: string; newVal: string }[] = [];

        type Def = { key: keyof UpdateTestCaseInput; prop: keyof typeof testCases.$inferInsert; label: string; toDb?: (v: unknown) => unknown; fromDb?: (v: unknown) => string };
        const defs: Def[] = [
            { key: "module", prop: "module", label: "module" },
            { key: "subModule", prop: "subModule", label: "subModule" },
            { key: "name", prop: "name", label: "name" },
            { key: "description", prop: "description", label: "description" },
            { key: "actualResult", prop: "actualResult", label: "actualResult" },
            { key: "comments", prop: "comments", label: "comments" },
            { key: "priority", prop: "priority", label: "priority", toDb: (v) => PRIORITY_TO_DB[v as TestCasePriority], fromDb: (v) => PRIORITY_FROM_DB[v as string] ?? String(v) },
            { key: "testStatus", prop: "testStatus", label: "testStatus", toDb: (v) => STATUS_TO_DB[v as TestCaseStatus], fromDb: (v) => STATUS_FROM_DB[v as string] ?? String(v) },
        ];
        for (const d of defs) {
            const v = updates[d.key];
            if (v === undefined) continue;
            const curRaw = tc[d.prop as keyof TcRow];
            const curDisp = Array.isArray(curRaw) ? JSON.stringify(curRaw) : d.fromDb ? d.fromDb(curRaw) : String(curRaw ?? "");
            const newDisp = Array.isArray(v) ? JSON.stringify(v) : String(v ?? "");
            if (curDisp !== newDisp) {
                set[d.prop] = (d.toDb ? d.toDb(v) : (v as never)) as never;
                changes.push(d.label);
                historyEntries.push({ field: d.label, oldVal: curDisp, newVal: newDisp });
            }
        }
        // Array fields stored natively (tags).
        if (updates.tags !== undefined) {
            const oldStr = JSON.stringify(tc.tags);
            const newStr = JSON.stringify(updates.tags);
            if (oldStr !== newStr) {
                set.tags = updates.tags;
                changes.push("tags");
                historyEntries.push({ field: "tags", oldVal: oldStr, newVal: newStr });
            }
        }
        // assignedTo → assigned_to_id (compare by uuid so re-selecting the same assignee is a no-op)
        if (updates.assignedTo !== undefined) {
            const newId = resolveActor(updates.assignedTo);
            if (String(tc.assignedToId ?? "") !== String(newId ?? "")) {
                set.assignedToId = newId;
                changes.push("assignedTo");
                historyEntries.push({ field: "assignedTo", oldVal: existing.assigneeName || "Unassigned", newVal: String(updates.assignedTo) });
            }
        }
        // executionDate (explicit)
        if (updates.executionDate !== undefined) {
            const curDisp = String(tc.executionDate ?? "");
            const newDisp = String(updates.executionDate ?? "");
            if (curDisp !== newDisp) {
                set.executionDate = updates.executionDate;
                changes.push("executionDate");
                historyEntries.push({ field: "executionDate", oldVal: curDisp, newVal: newDisp });
            }
        }
        // Auto-set execution date when status moves to an executed state.
        if (updates.testStatus && EXECUTED_DB.includes(STATUS_TO_DB[updates.testStatus]) && !updates.executionDate && !tc.executionDate) {
            set.executionDate = todayDate();
        }

        // relatedBugs → replace the join set (not a column change for version purposes, but tracked).
        let newRelatedBugIds: string[] | null = null;
        if (updates.relatedBugs !== undefined) {
            newRelatedBugIds = updates.relatedBugs;
            changes.push("relatedBugs");
        }

        if (changes.length === 0) {
            const links = await this.relatedBugsByCase([tc.id]);
            return { testCase: rowToTestCase(tc, existing.projectName, links[tc.id] ?? [], existing.assigneeName), changes: [] };
        }

        const updated = await db.transaction(async (tx) => {
            const [row] = await tx
                .update(testCases)
                .set({ ...set, version: sql`${testCases.version} + 1` })
                .where(eq(testCases.id, tc.id))
                .returning();
            if (historyEntries.length) {
                await tx.insert(testCaseHistory).values(
                    historyEntries.map((h) => ({
                        testCaseId: tc.id,
                        changedField: h.field,
                        oldValue: h.oldVal,
                        newValue: h.newVal,
                        changedBy: resolveActor(changedBy),
                    })),
                );
            }
            if (newRelatedBugIds) {
                await tx.delete(testCaseBugs).where(eq(testCaseBugs.testCaseId, tc.id));
                const resolved = await this.resolveBugIds(newRelatedBugIds);
                const uuids = newRelatedBugIds.map((d) => resolved[d]).filter(Boolean) as string[];
                if (uuids.length) {
                    await tx.insert(testCaseBugs).values(uuids.map((u) => ({ testCaseId: tc.id, bugId: u })));
                }
            }
            return row;
        });

        logger.info(`Test case updated: ${updated.tcId} (v${updated.version}), changed: [${changes.join(", ")}]`);
        await activityLogRepository.log({
            action: "test_case.updated",
            entityType: "test_case",
            entityId: updated.id,
            projectId: updated.projectId,
            metadata: { version: updated.version, changes },
        });
        // Re-fetch with the assignee join so a changed assignee returns the correct display name.
        const refreshed = await this.getById(updated.id);
        return { testCase: refreshed as TestCase, changes };
    }

    async bulkUpdate(input: BulkUpdateInput): Promise<{ updated: number; testCases: TestCase[] }> {
        const updated: TestCase[] = [];
        for (const id of input.ids) {
            const result = await this.update(id, {
                ...(input.testStatus && { testStatus: input.testStatus }),
                ...(input.assignedTo && { assignedTo: input.assignedTo }),
                changedBy: input.changedBy || "QA Team",
            });
            if (result) updated.push(result.testCase);
        }
        logger.info(`Bulk updated ${updated.length} test cases`);
        return { updated: updated.length, testCases: updated };
    }

    async getHistory(idOrTcId: string): Promise<TestCaseHistoryEntry[]> {
        const isUuid = UUID_RE.test(idOrTcId);
        const tcRows = await db
            .select({ id: testCases.id, tcId: testCases.tcId })
            .from(testCases)
            .where(isUuid ? eq(testCases.id, idOrTcId) : eq(testCases.tcId, idOrTcId))
            .limit(1);
        if (!tcRows[0]) return [];
        const rows = await db
            .select()
            .from(testCaseHistory)
            .where(eq(testCaseHistory.testCaseId, tcRows[0].id))
            .orderBy(desc(testCaseHistory.changedAt));
        return rows.map((r) => ({
            id: r.id,
            tcId: tcRows[0].tcId,
            changedField: r.changedField,
            oldValue: r.oldValue ?? "",
            newValue: r.newValue ?? "",
            changedBy: r.changedBy ?? "",
            changedAt: r.changedAt,
        }));
    }

    async delete(idOrTcId: string): Promise<boolean> {
        const isUuid = UUID_RE.test(idOrTcId);
        const row = await db
            .select({ id: testCases.id })
            .from(testCases)
            .where(and(isNull(testCases.deletedAt), isUuid ? eq(testCases.id, idOrTcId) : eq(testCases.tcId, idOrTcId)))
            .limit(1);
        if (!row[0]) return false;
        await db.update(testCases).set({ deletedAt: new Date().toISOString() }).where(eq(testCases.id, row[0].id));
        logger.info(`Test case soft-deleted: ${idOrTcId}`);
        await activityLogRepository.log({
            action: "test_case.deleted",
            entityType: "test_case",
            entityId: row[0].id,
        });
        return true;
    }

    /**
     * Soft-delete every test case in a module for a project (the "delete whole module" action).
     * Cleans up the related-bug join rows and logs a single activity entry. Returns the count
     * removed so the API can report it; 0 when the module has no live cases.
     */
    async deleteByModule(projectName: string, module: string): Promise<number> {
        const projectId = await this.resolveProjectId(projectName);
        if (!projectId) return 0;

        const rows = await db
            .select({ id: testCases.id })
            .from(testCases)
            .where(and(eq(testCases.projectId, projectId), eq(testCases.module, module), isNull(testCases.deletedAt)));
        if (rows.length === 0) return 0;

        const ids = rows.map((r) => r.id);
        await db.transaction(async (tx) => {
            await tx.update(testCases).set({ deletedAt: new Date().toISOString() }).where(inArray(testCases.id, ids));
            await tx.delete(testCaseBugs).where(inArray(testCaseBugs.testCaseId, ids));
        });

        logger.info(`Deleted module "${module}" in project "${projectName}": ${ids.length} test case(s)`);
        await activityLogRepository.log({
            action: 'test_case.module_deleted',
            entityType: 'test_case',
            projectId,
            metadata: { module, count: ids.length },
        });
        return ids.length;
    }

    async getModuleTree(projectName?: string): Promise<ModuleNode[]> {
        const conds = [isNull(testCases.deletedAt)];
        if (projectName) {
            const pid = await this.resolveProjectId(projectName);
            if (!pid) return [];
            conds.push(eq(testCases.projectId, pid));
        }
        const rows = await db
            .select({ module: testCases.module, subModule: testCases.subModule, n: count() })
            .from(testCases)
            .where(and(...conds))
            .groupBy(testCases.module, testCases.subModule);

        const moduleMap = new Map<string, Map<string, number>>();
        for (const r of rows) {
            if (!moduleMap.has(r.module)) moduleMap.set(r.module, new Map());
            const sub = r.subModule || "General";
            moduleMap.get(r.module)!.set(sub, (moduleMap.get(r.module)!.get(sub) || 0) + Number(r.n));
        }
        const tree: ModuleNode[] = [];
        for (const [module, subMap] of moduleMap) {
            let total = 0;
            const subModules: Array<{ name: string; count: number }> = [];
            for (const [name, c] of subMap) {
                subModules.push({ name, count: c });
                total += c;
            }
            tree.push({ module, subModules, totalCount: total });
        }
        return tree.sort((a, b) => b.totalCount - a.totalCount);
    }

    async getAnalytics(projectName?: string): Promise<TestCaseAnalytics> {
        const conds = [isNull(testCases.deletedAt)];
        if (projectName) {
            const pid = await this.resolveProjectId(projectName);
            if (!pid) return emptyAnalytics();
            conds.push(eq(testCases.projectId, pid));
        }
        const where = and(...conds);

        const [statusRows, prioRows, typeRows, moduleRows, totalRow, recentRows, linkedRow] = await Promise.all([
            db.select({ k: testCases.testStatus, n: count() }).from(testCases).where(where).groupBy(testCases.testStatus),
            db.select({ k: testCases.priority, n: count() }).from(testCases).where(where).groupBy(testCases.priority),
            db.select({ k: testCases.type, n: count() }).from(testCases).where(where).groupBy(testCases.type),
            db.select({
                module: testCases.module,
                total: count(),
                passed: sum(sql<number>`case when ${testCases.testStatus} = 'passed' then 1 else 0 end`),
                failed: sum(sql<number>`case when ${testCases.testStatus} = 'failed' then 1 else 0 end`),
                notExecuted: sum(sql<number>`case when ${testCases.testStatus} = 'not_executed' then 1 else 0 end`),
            }).from(testCases).where(where).groupBy(testCases.module),
            db.select({ total: count() }).from(testCases).where(where),
            db.select({ tc: testCases, projectName: projects.name, assigneeName: assigneeUser.name })
                .from(testCases)
                .leftJoin(projects, eq(testCases.projectId, projects.id))
                .leftJoin(assigneeUser, eq(testCases.assignedToId, assigneeUser.id))
                .where(where)
                .orderBy(desc(testCases.createdAt))
                .limit(10),
            db.select({ n: count() })
                .from(testCaseBugs)
                .innerJoin(testCases, eq(testCaseBugs.testCaseId, testCases.id))
                .where(where),
        ]);

        const byStatus = filled(STATUS_FROM_DB, statusRows);
        const byPriority = filled(PRIORITY_FROM_DB, prioRows);
        const byType = filled(RECORD_TYPE_FROM_DB, typeRows);
        const byModule: Record<string, number> = {};
        const moduleCoverage = moduleRows
            .map((r) => ({
                module: r.module,
                total: Number(r.total ?? 0),
                passed: Number(r.passed ?? 0),
                failed: Number(r.failed ?? 0),
                notExecuted: Number(r.notExecuted ?? 0),
            }))
            .sort((a, b) => b.total - a.total);
        for (const m of moduleCoverage) byModule[m.module] = m.total;

        const recentIds = recentRows.map((r) => r.tc.id);
        const recentLinks = await this.relatedBugsByCase(recentIds);

        const notExecuted = byStatus["Not Executed"];
        const passed = byStatus["Passed"];
        const failed = byStatus["Failed"];
        const blocked = byStatus["Blocked"];
        const skipped = byStatus["Skipped"];
        const executed = passed + failed + blocked + skipped;
        const passRate = executed > 0 ? Math.round((passed / executed) * 100) : 0;

        // AI insights from module coverage
        let mostUntestedModule = "N/A";
        let remainingCases = 0;
        let lowestPassRateModule = "N/A";
        let lowestPassRate = 100;
        for (const m of moduleCoverage) {
            if (m.notExecuted > remainingCases) {
                remainingCases = m.notExecuted;
                mostUntestedModule = m.module;
            }
            const executedInModule = m.passed + m.failed;
            if (executedInModule > 0) {
                const rate = Math.round((m.passed / executedInModule) * 100);
                if (rate < lowestPassRate) {
                    lowestPassRate = rate;
                    lowestPassRateModule = m.module;
                }
            }
        }

        return {
            totalCases: Number(totalRow[0]?.total ?? 0),
            byStatus,
            byPriority,
            byModule,
            byType,
            notExecuted,
            passed,
            failed,
            blocked,
            skipped,
            passRate,
            linkedBugs: Number(linkedRow[0]?.n ?? 0),
            modulesCovered: moduleCoverage.length,
            recentCases: recentRows.map((r) => rowToTestCase(r.tc, r.projectName, recentLinks[r.tc.id] ?? [], r.assigneeName)),
            moduleCoverage,
            priorityDistribution: (["Critical", "High", "Medium", "Low"] as TestCasePriority[]).map((p) => ({ priority: p, count: byPriority[p] })),
            executionTrend: await this.executionTrend(where),
            aiInsights: { mostUntestedModule, remainingCases, lowestPassRateModule, lowestPassRate },
        };
    }

    private async executionTrend(where: ReturnType<typeof and>): Promise<Array<{ date: string; executed: number; passed: number; failed: number }>> {
        const labels: string[] = [];
        const today = new Date();
        for (let i = 6; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            labels.push(d.toISOString().slice(0, 10));
        }
        const start = labels[0];
        const rows = await db
            .select({
                d: testCases.executionDate,
                executed: count(),
                passed: sum(sql<number>`case when ${testCases.testStatus} = 'passed' then 1 else 0 end`),
                failed: sum(sql<number>`case when ${testCases.testStatus} = 'failed' then 1 else 0 end`),
            })
            .from(testCases)
            .where(and(where, isNotNull(testCases.executionDate), gte(testCases.executionDate, start)))
            .groupBy(testCases.executionDate);
        const map: Record<string, { executed: number; passed: number; failed: number }> = {};
        for (const r of rows) {
            if (r.d) map[r.d] = { executed: Number(r.executed ?? 0), passed: Number(r.passed ?? 0), failed: Number(r.failed ?? 0) };
        }
        return labels.map((l) => ({ date: l, ...(map[l] ?? { executed: 0, passed: 0, failed: 0 }) }));
    }

    /* ---- normalizers (mirror the in-memory repo) ---- */

    private normalizePriority(raw?: string): TestCasePriority {
        if (!raw) return "Medium";
        const p = raw.toLowerCase();
        if (p.includes("critical") || p === "p0" || p === "p1") return "Critical";
        if (p.includes("high") || p === "p2") return "High";
        if (p.includes("low") || p === "p4") return "Low";
        return "Medium";
    }
    private normalizeType(raw?: string): TestCaseType {
        if (!raw) return "functional";
        const t = raw.toLowerCase();
        if (t.includes("negative")) return "negative";
        if (t.includes("edge")) return "edge";
        if (t.includes("security")) return "security";
        if (t.includes("boundary")) return "boundary";
        if (t.includes("scenario")) return "scenario";
        return "functional";
    }

    // Sample seeding removed — clean foundation (no demo data).
}

/* ---- helpers ---- */

// `type` labels equal their display strings, so this identity map just fills all keys.
const RECORD_TYPE_FROM_DB: Record<string, TestCaseType> = {
    functional: "functional", negative: "negative", edge: "edge", security: "security", boundary: "boundary", scenario: "scenario",
};

function filled<R extends Record<string, string>>(fromDb: R, rows: { k: string | null; n: number }[]): Record<string, number> {
    const out: Record<string, number> = {};
    for (const display of Object.values(fromDb)) out[display] = 0;
    for (const r of rows) {
        const display = fromDb[r.k ?? ""] ?? (r.k ?? "Unknown");
        out[display] = Number(r.n);
    }
    return out;
}
function emptyAnalytics(): TestCaseAnalytics {
    return {
        totalCases: 0,
        byStatus: filled(STATUS_FROM_DB, []),
        byPriority: filled(PRIORITY_FROM_DB, []),
        byModule: {},
        byType: filled(RECORD_TYPE_FROM_DB, []),
        notExecuted: 0, passed: 0, failed: 0, blocked: 0, skipped: 0,
        passRate: 0, linkedBugs: 0, modulesCovered: 0,
        recentCases: [], moduleCoverage: [], priorityDistribution: [
            { priority: "Critical", count: 0 }, { priority: "High", count: 0 }, { priority: "Medium", count: 0 }, { priority: "Low", count: 0 },
        ],
        executionTrend: [],
        aiInsights: { mostUntestedModule: "N/A", remainingCases: 0, lowestPassRateModule: "N/A", lowestPassRate: 100 },
    };
}

export default new SqlTestCaseRepository();
