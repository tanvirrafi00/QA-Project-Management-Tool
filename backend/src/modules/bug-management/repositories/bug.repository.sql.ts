/**
 * SQL-backed Bug Repository (Drizzle / PostgreSQL).
 *
 * Same async interface as the in-memory repo; selected via `USE_DB_BUGS=true` (see
 * `bug.repository.ts`). Maps snake_case rows ↔ camelCase `Bug` domain; lowercase DB enums ↔ display
 * strings; analytics via SQL `GROUP BY`; projectName → project_id (FK) on write, joined back on read.
 *
 * `reporter`/`assignee` are stored as user ids (`reporterId`/`assigneeId`); reads left-join `users`
 * twice (aliased) to recover the display names. A non-uuid value supplied on write is dropped (null)
 * — assignment must go through the project-members dropdown, which sends the user uuid.
 */

import { and, count, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../../../shared/db";
import { bugHistory, bugs, projects, users } from "../../../shared/db/schema";
import logger from "../../../shared/logger";
import activityLogRepository from "../../../shared/db/repositories/activity-log.repository";
import type {
    Bug,
    BugAnalytics,
    BugFilter,
    BugHistoryEntry,
    BugLayer,
    BugPriority,
    BugSeverity,
    BugStatus,
    SaveBugInput,
    UpdateBugInput,
} from "../types";

type BugRow = typeof bugs.$inferSelect;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// `users` joined twice (assignee + reporter) so rowToBug can recover display names from the uuid FKs.
const assigneeUser = alias(users, "bug_assignee");
const reporterUser = alias(users, "bug_reporter");

/* ---- enum display ↔ lowercase DB maps ---- */

const LAYER_TO_DB: Record<BugLayer, string> = {
    Frontend: "frontend", Backend: "backend", Integration: "integration", Mobile: "mobile", Infrastructure: "infrastructure",
};
const LAYER_FROM_DB: Record<string, BugLayer> = {
    frontend: "Frontend", backend: "Backend", integration: "Integration", mobile: "Mobile", infrastructure: "Infrastructure",
};
const SEVERITY_TO_DB: Record<BugSeverity, string> = { Critical: "critical", High: "high", Medium: "medium", Low: "low" };
const SEVERITY_FROM_DB: Record<string, BugSeverity> = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };
const PRIORITY_TO_DB: Record<BugPriority, string> = { P1: "p1", P2: "p2", P3: "p3", P4: "p4" };
const PRIORITY_FROM_DB: Record<string, BugPriority> = { p1: "P1", p2: "P2", p3: "P3", p4: "P4" };
const STATUS_TO_DB: Record<BugStatus, string> = {
    Open: "open", Assigned: "assigned", "In Progress": "in_progress", Fixed: "fixed",
    "Ready For QA": "ready_for_qa", Verified: "verified", Closed: "closed", Reopened: "reopened",
};
const STATUS_FROM_DB: Record<string, BugStatus> = {
    open: "Open", assigned: "Assigned", in_progress: "In Progress", fixed: "Fixed",
    ready_for_qa: "Ready For QA", verified: "Verified", closed: "Closed", reopened: "Reopened",
};
const OPEN_DB_STATUSES = ["open", "assigned", "in_progress", "reopened"];

/** Free-text actor → user id (uuid passthrough; non-uuid → null until RBAC). */
function resolveActor(actor?: string | null): string | null {
    return actor && UUID_RE.test(actor) ? actor : null;
}

function slug(name: string): string {
    return name.replace(/\s+/g, "_").toLowerCase();
}

function rowToBug(
    bug: BugRow,
    projectName: string | null,
    assigneeName?: string | null,
    reporterName?: string | null,
): Bug {
    const name = projectName ?? "";
    return {
        id: bug.id,
        bugId: bug.bugId,
        projectId: slug(name),
        projectName: name,
        title: bug.title,
        description: bug.description,
        module: bug.module,
        layer: LAYER_FROM_DB[bug.layer] ?? "Backend",
        severity: SEVERITY_FROM_DB[bug.severity] ?? "Medium",
        priority: PRIORITY_FROM_DB[bug.priority] ?? "P3",
        status: STATUS_FROM_DB[bug.status] ?? "Open",
        environment: bug.environment,
        precondition: bug.precondition,
        currentBehavior: bug.currentBehavior,
        stepsToReproduce: bug.stepsToReproduce,
        expectedResult: bug.expectedResult,
        actualResult: bug.actualResult,
        impact: bug.impact,
        reporter: reporterName || "",
        reporterId: bug.reporterId ?? undefined,
        assignee: assigneeName && assigneeName.length > 0 ? assigneeName : "Unassigned",
        assigneeId: bug.assigneeId ?? undefined,
        createdAt: bug.createdAt,
        updatedAt: bug.updatedAt,
        version: bug.version,
        possibleRootCause: bug.possibleRootCause ?? undefined,
        suggestedFix: bug.suggestedFix ?? undefined,
        similarBugs: bug.similarBugs,
        missingInfo: bug.missingInfo,
        tags: bug.tags,
        aiConfidence: bug.aiConfidence !== null ? Number(bug.aiConfidence) : undefined,
    };
}

class SqlBugRepository {
    generateBugId(): string {
        // timestamp + random (no shared counter across instances; uniqueness enforced by DB)
        const rand = Math.random().toString(36).slice(2, 5).padStart(3, "0").toUpperCase();
        return `BUG-${String(Date.now()).slice(-6)}${rand}`;
    }

    private async resolveProjectId(projectName: string): Promise<string | undefined> {
        const rows = await db
            .select({ id: projects.id })
            .from(projects)
            .where(and(eq(projects.name, projectName), isNull(projects.deletedAt)))
            .limit(1);
        return rows[0]?.id;
    }

    async save(input: SaveBugInput): Promise<Bug> {
        const projectId = await this.resolveProjectId(input.projectName);
        if (!projectId) throw new Error(`Project "${input.projectName}" not found`);

        const [row] = await db
            .insert(bugs)
            .values({
                bugId: input.bugId,
                projectId,
                title: input.title,
                description: input.description ?? "",
                module: input.module ?? "",
                layer: (LAYER_TO_DB[input.layer] ?? "backend") as BugRow["layer"],
                severity: (SEVERITY_TO_DB[input.severity] ?? "medium") as BugRow["severity"],
                priority: (PRIORITY_TO_DB[input.priority] ?? "p3") as BugRow["priority"],
                status: (STATUS_TO_DB[input.status || "Open"] ?? "open") as BugRow["status"],
                environment: input.environment ?? "Not specified",
                precondition: input.precondition ?? "",
                currentBehavior: input.currentBehavior ?? [],
                stepsToReproduce: input.stepsToReproduce ?? [],
                expectedResult: input.expectedResult ?? "",
                actualResult: input.actualResult ?? "",
                impact: input.impact ?? "",
                reporterId: resolveActor(input.reporter),
                assigneeId: resolveActor(input.assignee),
                possibleRootCause: input.possibleRootCause,
                suggestedFix: input.suggestedFix,
                similarBugs: input.similarBugs ?? [],
                missingInfo: input.missingInfo ?? [],
                tags: input.tags ?? [],
                aiConfidence: input.aiConfidence !== undefined ? String(input.aiConfidence) : null,
            })
            .returning();

        logger.info(`Bug saved: ${row.bugId} (${row.title})`);
        await activityLogRepository.log({
            action: "bug.created",
            entityType: "bug",
            entityId: row.id,
            projectId: row.projectId,
            metadata: { bugId: row.bugId },
        });
        return rowToBug(row, input.projectName);
    }

    private async fetchOne(where: ReturnType<typeof eq>): Promise<Bug | undefined> {
        const rows = await db
            .select({ bug: bugs, projectName: projects.name, assigneeName: assigneeUser.name, reporterName: reporterUser.name })
            .from(bugs)
            .leftJoin(projects, eq(bugs.projectId, projects.id))
            .leftJoin(assigneeUser, eq(bugs.assigneeId, assigneeUser.id))
            .leftJoin(reporterUser, eq(bugs.reporterId, reporterUser.id))
            .where(and(isNull(bugs.deletedAt), where))
            .limit(1);
        return rows[0] ? rowToBug(rows[0].bug, rows[0].projectName, rows[0].assigneeName, rows[0].reporterName) : undefined;
    }

    async getById(idOrBugId: string): Promise<Bug | undefined> {
        const isUuid = UUID_RE.test(idOrBugId);
        return this.fetchOne(isUuid ? eq(bugs.id, idOrBugId) : eq(bugs.bugId, idOrBugId));
    }

    async getAll(filter?: BugFilter): Promise<Bug[]> {
        const conds = [isNull(bugs.deletedAt)];
        if (filter?.projectName) {
            const pid = await this.resolveProjectId(filter.projectName);
            if (!pid) return [];
            conds.push(eq(bugs.projectId, pid));
        }
        if (filter?.layer) conds.push(eq(bugs.layer, (LAYER_TO_DB[filter.layer] ?? filter.layer.toLowerCase()) as BugRow["layer"]));
        if (filter?.severity) conds.push(eq(bugs.severity, (SEVERITY_TO_DB[filter.severity] ?? filter.severity.toLowerCase()) as BugRow["severity"]));
        if (filter?.status) conds.push(eq(bugs.status, (STATUS_TO_DB[filter.status] ?? filter.status.toLowerCase()) as BugRow["status"]));
        if (filter?.module) conds.push(eq(bugs.module, filter.module));
        if (filter?.search) {
            const q = `%${filter.search.toLowerCase()}%`;
            conds.push(or(ilike(bugs.title, q), ilike(bugs.bugId, q), ilike(bugs.description, q))!);
        }
        const rows = await db
            .select({ bug: bugs, projectName: projects.name, assigneeName: assigneeUser.name, reporterName: reporterUser.name })
            .from(bugs)
            .leftJoin(projects, eq(bugs.projectId, projects.id))
            .leftJoin(assigneeUser, eq(bugs.assigneeId, assigneeUser.id))
            .leftJoin(reporterUser, eq(bugs.reporterId, reporterUser.id))
            .where(and(...conds))
            .orderBy(desc(bugs.createdAt));
        return rows.map((r) => rowToBug(r.bug, r.projectName, r.assigneeName, r.reporterName));
    }

    async update(
        idOrBugId: string,
        updates: UpdateBugInput,
    ): Promise<{ bug: Bug; changes: string[] } | undefined> {
        const isUuid = UUID_RE.test(idOrBugId);
        const existingRows = await db
            .select({ bug: bugs, projectName: projects.name, assigneeName: assigneeUser.name, reporterName: reporterUser.name })
            .from(bugs)
            .leftJoin(projects, eq(bugs.projectId, projects.id))
            .leftJoin(assigneeUser, eq(bugs.assigneeId, assigneeUser.id))
            .leftJoin(reporterUser, eq(bugs.reporterId, reporterUser.id))
            .where(and(isNull(bugs.deletedAt), isUuid ? eq(bugs.id, idOrBugId) : eq(bugs.bugId, idOrBugId)))
            .limit(1);
        const existing = existingRows[0];
        if (!existing) return undefined;
        const bug = existing.bug;

        const changedBy = updates.changedBy || "QA Team";
        const now = new Date().toISOString();
        const set: Partial<typeof bugs.$inferInsert> = { updatedAt: now, updatedBy: resolveActor(changedBy) };
        const changes: string[] = [];
        const historyEntries: { field: string; oldVal: string; newVal: string }[] = [];

        type Def = {
            key: keyof UpdateBugInput;
            prop: keyof typeof bugs.$inferInsert;
            label: string;
            toDb?: (v: unknown) => unknown;
            fromDb?: (v: unknown) => string;
        };
        const defs: Def[] = [
            { key: "title", prop: "title", label: "title" },
            { key: "description", prop: "description", label: "description" },
            { key: "module", prop: "module", label: "module" },
            { key: "environment", prop: "environment", label: "environment" },
            { key: "precondition", prop: "precondition", label: "precondition" },
            { key: "expectedResult", prop: "expectedResult", label: "expectedResult" },
            { key: "actualResult", prop: "actualResult", label: "actualResult" },
            { key: "impact", prop: "impact", label: "impact" },
            { key: "severity", prop: "severity", label: "severity", toDb: (v) => SEVERITY_TO_DB[v as BugSeverity], fromDb: (v) => SEVERITY_FROM_DB[v as string] ?? String(v) },
            { key: "priority", prop: "priority", label: "priority", toDb: (v) => PRIORITY_TO_DB[v as BugPriority], fromDb: (v) => PRIORITY_FROM_DB[v as string] ?? String(v) },
            { key: "status", prop: "status", label: "status", toDb: (v) => STATUS_TO_DB[v as BugStatus], fromDb: (v) => STATUS_FROM_DB[v as string] ?? String(v) },
            { key: "layer", prop: "layer", label: "layer", toDb: (v) => LAYER_TO_DB[v as BugLayer], fromDb: (v) => LAYER_FROM_DB[v as string] ?? String(v) },
            { key: "currentBehavior", prop: "currentBehavior", label: "currentBehavior" },
            { key: "stepsToReproduce", prop: "stepsToReproduce", label: "stepsToReproduce" },
            { key: "possibleRootCause", prop: "possibleRootCause", label: "possibleRootCause" },
            { key: "suggestedFix", prop: "suggestedFix", label: "suggestedFix" },
            { key: "tags", prop: "tags", label: "tags" },
            { key: "assignee", prop: "assigneeId", label: "assignee", toDb: (v) => resolveActor(v as string) },
        ];

        for (const d of defs) {
            const inputVal = updates[d.key];
            if (inputVal === undefined) continue;
            const curRaw = bug[d.prop as keyof BugRow];
            const curDisp = Array.isArray(curRaw)
                ? JSON.stringify(curRaw)
                : d.fromDb
                    ? d.fromDb(curRaw)
                    : String(curRaw);
            const newDisp = Array.isArray(inputVal) ? JSON.stringify(inputVal) : String(inputVal);
            if (curDisp !== newDisp) {
                const dbVal = d.toDb ? d.toDb(inputVal) : (inputVal as never);
                set[d.prop] = dbVal as never;
                changes.push(d.label);
                historyEntries.push({ field: d.label, oldVal: curDisp, newVal: newDisp });
            }
        }

        if (changes.length === 0) {
            return { bug: rowToBug(bug, existing.projectName, existing.assigneeName, existing.reporterName), changes: [] };
        }

        const updated = await db.transaction(async (tx) => {
            const [row] = await tx
                .update(bugs)
                .set({ ...set, version: increment() })
                .where(eq(bugs.id, bug.id))
                .returning();
            if (historyEntries.length) {
                await tx.insert(bugHistory).values(
                    historyEntries.map((h) => ({
                        bugId: bug.id,
                        changedField: h.field,
                        oldValue: h.oldVal,
                        newValue: h.newVal,
                        changedBy: resolveActor(changedBy),
                    })),
                );
            }
            return row;
        });

        logger.info(`Bug updated: ${updated.bugId} (v${updated.version}), changed: [${changes.join(", ")}]`);
        await activityLogRepository.log({
            action: "bug.updated",
            entityType: "bug",
            entityId: updated.id,
            projectId: updated.projectId,
            metadata: { version: updated.version, changes },
        });
        // Re-fetch with the user joins so a changed assignee/reporter returns the correct display name.
        const refreshed = await this.fetchOne(eq(bugs.id, updated.id));
        return { bug: refreshed ?? rowToBug(updated, existing.projectName), changes };
    }

    async getHistory(idOrBugId: string): Promise<BugHistoryEntry[]> {
        const isUuid = UUID_RE.test(idOrBugId);
        const bugRows = await db
            .select({ id: bugs.id, bugId: bugs.bugId })
            .from(bugs)
            .where(isUuid ? eq(bugs.id, idOrBugId) : eq(bugs.bugId, idOrBugId))
            .limit(1);
        if (!bugRows[0]) return [];
        const rows = await db
            .select()
            .from(bugHistory)
            .where(eq(bugHistory.bugId, bugRows[0].id))
            .orderBy(desc(bugHistory.changedAt));
        return rows.map((r) => ({
            id: r.id,
            bugId: bugRows[0].bugId, // display bug_id, matching the in-memory shape
            changedField: r.changedField,
            oldValue: r.oldValue ?? "",
            newValue: r.newValue ?? "",
            changedBy: r.changedBy ?? "",
            changedAt: r.changedAt,
        }));
    }

    async delete(idOrBugId: string): Promise<boolean> {
        const isUuid = UUID_RE.test(idOrBugId);
        const row = await db
            .select({ id: bugs.id })
            .from(bugs)
            .where(and(isNull(bugs.deletedAt), isUuid ? eq(bugs.id, idOrBugId) : eq(bugs.bugId, idOrBugId)))
            .limit(1);
        if (!row[0]) return false;
        await db.update(bugs).set({ deletedAt: new Date().toISOString() }).where(eq(bugs.id, row[0].id));
        logger.info(`Bug soft-deleted: ${idOrBugId}`);
        await activityLogRepository.log({
            action: "bug.deleted",
            entityType: "bug",
            entityId: row[0].id,
        });
        return true;
    }

    async getAnalytics(projectName?: string): Promise<BugAnalytics> {
        const conds = [isNull(bugs.deletedAt)];
        if (projectName) {
            const pid = await this.resolveProjectId(projectName);
            if (!pid) return emptyAnalytics();
            conds.push(eq(bugs.projectId, pid));
        }
        const where = and(...conds);

        const [layerRows, sevRows, statusRows, prioRows, modRows, totals, recent] = await Promise.all([
            db.select({ k: bugs.layer, n: count() }).from(bugs).where(where).groupBy(bugs.layer),
            db.select({ k: bugs.severity, n: count() }).from(bugs).where(where).groupBy(bugs.severity),
            db.select({ k: bugs.status, n: count() }).from(bugs).where(where).groupBy(bugs.status),
            db.select({ k: bugs.priority, n: count() }).from(bugs).where(where).groupBy(bugs.priority),
            db.select({ k: bugs.module, n: count() }).from(bugs).where(where).groupBy(bugs.module),
            db.select({ total: count() }).from(bugs).where(where),
            db.select({ bug: bugs, projectName: projects.name, assigneeName: assigneeUser.name, reporterName: reporterUser.name })
                .from(bugs)
                .leftJoin(projects, eq(bugs.projectId, projects.id))
                .leftJoin(assigneeUser, eq(bugs.assigneeId, assigneeUser.id))
                .leftJoin(reporterUser, eq(bugs.reporterId, reporterUser.id))
                .where(where)
                .orderBy(desc(bugs.createdAt))
                .limit(10),
        ]);

        const byLayer = filled(LAYER_FROM_DB, layerRows);
        const bySeverity = filled(SEVERITY_FROM_DB, sevRows);
        const byStatus = filled(STATUS_FROM_DB, statusRows);
        const byPriority = filled(PRIORITY_FROM_DB, prioRows);
        const byModule: Record<string, number> = {};
        for (const r of modRows) byModule[r.k ?? "Unknown"] = Number(r.n);

        const t = totals[0];
        // open/critical need conditional aggregation; compute from status/severity groups for accuracy
        let openBugs = 0;
        for (const r of statusRows) if (OPEN_DB_STATUSES.includes(r.k)) openBugs += Number(r.n);
        let criticalBugs = 0;
        for (const r of sevRows) if (r.k === "critical") criticalBugs += Number(r.n);

        return {
            totalBugs: Number(t?.total ?? 0),
            byLayer,
            bySeverity,
            byStatus,
            byModule,
            byPriority,
            openBugs,
            criticalBugs,
            recentBugs: recent.map((r) => rowToBug(r.bug, r.projectName, r.assigneeName, r.reporterName)),
        };
    }

    async findSimilar(title: string, module: string, limit = 3): Promise<string[]> {
        const titleWords = title.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
        const orConds = [];
        if (module) orConds.push(eq(bugs.module, module));
        for (const w of titleWords) orConds.push(ilike(bugs.title, `%${w}%`));
        if (orConds.length === 0) return [];

        const rows = await db
            .select({ bugId: bugs.bugId, title: bugs.title, module: bugs.module })
            .from(bugs)
            .where(and(isNull(bugs.deletedAt), or(...orConds)))
            .limit(100);

        const scored = rows.map((b) => {
            let score = 0;
            if (b.module === module) score += 2;
            const bw = b.title.toLowerCase().split(/\s+/);
            score += titleWords.filter((w) => bw.includes(w)).length;
            return { bugId: b.bugId, score };
        });
        return scored
            .filter((s) => s.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map((s) => s.bugId);
    }

    // Sample seeding removed — clean foundation (no demo data).
}

/* ---- helpers ---- */

function increment() {
    return sql`${bugs.version} + 1`;
}
function filled<R extends Record<string, string>>(fromDb: R, rows: { k: string | null; n: number }[]): Record<string, number> {
    const out: Record<string, number> = {};
    for (const display of Object.values(fromDb)) out[display] = 0;
    for (const r of rows) {
        const display = fromDb[r.k ?? ""] ?? (r.k ?? "Unknown");
        out[display] = Number(r.n);
    }
    return out;
}
function emptyAnalytics(): BugAnalytics {
    return {
        totalBugs: 0,
        byLayer: filled(LAYER_FROM_DB, []),
        bySeverity: filled(SEVERITY_FROM_DB, []),
        byStatus: filled(STATUS_FROM_DB, []),
        byModule: {},
        byPriority: filled(PRIORITY_FROM_DB, []),
        openBugs: 0,
        criticalBugs: 0,
        recentBugs: [],
    };
}

export default new SqlBugRepository();
