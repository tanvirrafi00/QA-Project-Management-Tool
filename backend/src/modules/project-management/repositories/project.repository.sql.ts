/**
 * SQL-backed Project Repository (Drizzle / PostgreSQL).
 *
 * Implements the SAME async interface as the in-memory repository so the service/controller are
 * unchanged across the swap (`USE_DB_PROJECTS=true` selects this impl; see `project.repository.ts`).
 *
 * - snake_case rows ↔ camelCase `Project` domain objects (mapping lives here).
 * - lowercase DB enum labels ↔ display strings.
 * - uniqueness via DB `UNIQUE` constraints + a pre-check (to preserve the friendly messages the
 *   controller maps to 409).
 * - statistics computed as SQL `GROUP BY` (no N+1, no in-memory aggregation).
 * - update + history rows written in one transaction.
 *
 * Status: Migration Roadmap Step 3.1. With `USE_DB_PROJECTS=true`, the bugs/test_cases tables are
 * still empty until 3.2/3.3 land, so stats read 0 in the interim (expected).
 */

import { and, count, desc, eq, ilike, inArray, isNull, ne, or, sql, sum } from "drizzle-orm";
import { db } from "../../../shared/db";
import { bugs, projectHistory, projects, testCases } from "../../../shared/db/schema";
import logger from "../../../shared/logger";
import activityLogRepository from "../../../shared/db/repositories/activity-log.repository";
import type {
    CreateProjectInput,
    DeleteCheckResult,
    Project,
    ProjectFilter,
    ProjectHistoryEntry,
    ProjectStatistics,
    ProjectStatus,
    ProjectSummary,
    ProjectType,
    ProjectWithStats,
    UpdateProjectInput,
} from "../types";

type ProjectRow = typeof projects.$inferSelect;

const TYPE_TO_DB: Record<ProjectType, typeof projects.type.enumValues[number]> = {
    "Web Application": "web_application",
    "Mobile Application": "mobile_application",
    API: "api",
    Microservices: "microservices",
    Other: "other",
};

const TYPE_FROM_DB: Record<string, ProjectType> = {
    web_application: "Web Application",
    mobile_application: "Mobile Application",
    api: "API",
    microservices: "Microservices",
    other: "Other",
};

function typeToDb(t: ProjectType): typeof projects.type.enumValues[number] {
    return TYPE_TO_DB[t] ?? "other";
}
function typeFromDb(t: string): ProjectType {
    return TYPE_FROM_DB[t] ?? "Other";
}
function statusToDb(s: ProjectStatus): typeof projects.status.enumValues[number] {
    return s === "Archived" ? "archived" : "active";
}
function statusFromDb(s: string): ProjectStatus {
    return s === "archived" ? "Archived" : "Active";
}

/** Resolve a free-text actor ("QA Team" / "System Seed") to a user id. Until RBAC lands (Step 6)
 *  non-uuid values become null; a real uuid (from the session) is passed through. */
function resolveActor(actor?: string): string | null {
    if (actor && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(actor)) {
        return actor;
    }
    return null;
}

const OPEN_BUG_STATUSES = ["open", "assigned", "in_progress", "reopened"] as const;

function rowToProject(row: ProjectRow): Project {
    return {
        id: row.id,
        projectCode: row.code,
        projectName: row.name,
        description: row.description,
        projectType: typeFromDb(row.type),
        status: statusFromDb(row.status),
        createdBy: row.createdBy ?? "",
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        version: row.version,
    };
}

class SqlProjectRepository {
    /** Normalize a project code to uppercase alphanumeric (mirrors the in-memory repo). */
    normalizeCode(code: string): string {
        return code.trim().toUpperCase().replace(/\s+/g, "-").replace(/[^A-Z0-9-]/g, "");
    }

    /** Resolve id | code | name → projects.id (case-insensitive on code/name). */
    private async resolveId(idOrCodeOrName: string): Promise<string | undefined> {
        const needle = idOrCodeOrName.trim().toLowerCase();
        const isUuid =
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrCodeOrName);
        const filters = [
            eq(sql`lower(${projects.code})`, needle),
            eq(sql`lower(${projects.name})`, needle),
        ];
        if (isUuid) filters.unshift(eq(projects.id, idOrCodeOrName));
        const rows = await db
            .select({ id: projects.id })
            .from(projects)
            .where(and(isNull(projects.deletedAt), or(...filters)))
            .limit(1);
        return rows[0]?.id;
    }

    async create(input: CreateProjectInput): Promise<Project> {
        const name = input.projectName.trim();
        const code = this.normalizeCode(input.projectCode);
        if (!name) throw new Error("Project name is required");
        if (!code) throw new Error("Project code is required");

        // Pre-check to preserve the friendly "already exists" messages the controller maps to 409.
        const nameClash = await db
            .select({ id: projects.id })
            .from(projects)
            .where(and(eq(sql`lower(${projects.name})`, name.toLowerCase()), isNull(projects.deletedAt)))
            .limit(1);
        if (nameClash.length) throw new Error(`A project with the name "${name}" already exists`);

        const codeClash = await db
            .select({ id: projects.id })
            .from(projects)
            .where(and(eq(projects.code, code), isNull(projects.deletedAt)))
            .limit(1);
        if (codeClash.length) throw new Error(`A project with the code "${code}" already exists`);

        const [row] = await db
            .insert(projects)
            .values({
                code,
                name,
                description: input.description?.trim() || "",
                type: typeToDb(input.projectType),
                status: statusToDb(input.status || "Active"),
                createdBy: resolveActor(input.createdBy),
                updatedBy: resolveActor(input.createdBy),
            })
            .returning();

        logger.info(`Project created: ${row.code} (${row.name})`);
        await activityLogRepository.log({
            action: "project.created",
            entityType: "project",
            entityId: row.id,
            projectId: row.id,
            metadata: { code: row.code, name: row.name },
        });
        return rowToProject(row);
    }

    async getById(idOrCodeOrName: string): Promise<Project | undefined> {
        const id = await this.resolveId(idOrCodeOrName);
        if (!id) return undefined;
        const rows = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
        return rows[0] ? rowToProject(rows[0]) : undefined;
    }

    /** Per-project bug stats (total/open/critical) for the given project ids — one grouped query. */
    private async bugStatsByProject(
        ids: string[],
    ): Promise<Record<string, { total: number; open: number; critical: number }>> {
        if (ids.length === 0) return {};
        const rows = await db
            .select({
                projectId: bugs.projectId,
                total: count(),
                open: sum(
                    sql<number>`case when ${bugs.status} in (${sql.join(
                        OPEN_BUG_STATUSES.map((s) => sql`${s}`),
                        sql`,`,
                    )}) then 1 else 0 end`,
                ),
                critical: sum(
                    sql<number>`case when ${bugs.severity} = 'critical' then 1 else 0 end`,
                ),
            })
            .from(bugs)
            .where(and(isNull(bugs.deletedAt), inArray(bugs.projectId, ids)))
            .groupBy(bugs.projectId);
        const out: Record<string, { total: number; open: number; critical: number }> = {};
        for (const r of rows) {
            out[r.projectId] = {
                total: Number(r.total ?? 0),
                open: Number(r.open ?? 0),
                critical: Number(r.critical ?? 0),
            };
        }
        return out;
    }

    /** Per-project live test-case counts for the given project ids — one grouped query. */
    private async tcCountsByProject(ids: string[]): Promise<Record<string, number>> {
        if (ids.length === 0) return {};
        const rows = await db
            .select({ projectId: testCases.projectId, total: count() })
            .from(testCases)
            .where(and(isNull(testCases.deletedAt), inArray(testCases.projectId, ids)))
            .groupBy(testCases.projectId);
        const out: Record<string, number> = {};
        for (const r of rows) out[r.projectId] = Number(r.total ?? 0);
        return out;
    }

    private statsFromMaps(
        projectId: string,
        bugStats: Record<string, { total: number; open: number; critical: number }>,
        tcCounts: Record<string, number>,
    ): ProjectStatistics {
        const b = bugStats[projectId] ?? { total: 0, open: 0, critical: 0 };
        const totalTestCases = tcCounts[projectId] ?? 0;
        return {
            totalBugs: b.total,
            openBugs: b.open,
            criticalBugs: b.critical,
            totalTestCases,
            generatedTestCases: totalTestCases,
        };
    }

    async getStatistics(projectName: string): Promise<ProjectStatistics> {
        const id = await this.resolveId(projectName);
        if (!id) {
            return { totalBugs: 0, openBugs: 0, criticalBugs: 0, totalTestCases: 0, generatedTestCases: 0 };
        }
        const [bugStats, tcCounts] = await Promise.all([
            this.bugStatsByProject([id]),
            this.tcCountsByProject([id]),
        ]);
        return this.statsFromMaps(id, bugStats, tcCounts);
    }

    async getWithStats(idOrCodeOrName: string): Promise<ProjectWithStats | undefined> {
        const id = await this.resolveId(idOrCodeOrName);
        if (!id) return undefined;
        const rows = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
        if (!rows[0]) return undefined;
        const project = rowToProject(rows[0]);
        const [bugStats, tcCounts] = await Promise.all([
            this.bugStatsByProject([id]),
            this.tcCountsByProject([id]),
        ]);
        return { ...project, statistics: this.statsFromMaps(id, bugStats, tcCounts) };
    }

    async getAll(filter?: ProjectFilter): Promise<Project[]> {
        const conds = [isNull(projects.deletedAt)];
        if (filter?.status) conds.push(eq(projects.status, statusToDb(filter.status)));
        if (filter?.projectType) conds.push(eq(projects.type, typeToDb(filter.projectType)));
        if (filter?.search) {
            const q = `%${filter.search.toLowerCase()}%`;
            conds.push(
                or(
                    ilike(projects.name, q),
                    ilike(projects.code, q),
                    ilike(projects.description, q),
                )!,
            );
        }
        const rows = await db
            .select()
            .from(projects)
            .where(and(...conds))
            .orderBy(desc(projects.createdAt));
        return rows.map(rowToProject);
    }

    async getAllWithStats(filter?: ProjectFilter): Promise<ProjectWithStats[]> {
        const projs = await this.getAll(filter);
        if (projs.length === 0) return [];
        const ids = projs.map((p) => p.id);
        const [bugStats, tcCounts] = await Promise.all([
            this.bugStatsByProject(ids),
            this.tcCountsByProject(ids),
        ]);
        return projs.map((p) => ({ ...p, statistics: this.statsFromMaps(p.id, bugStats, tcCounts) }));
    }

    async getActive(): Promise<Project[]> {
        return this.getAll({ status: "Active" });
    }

    async update(
        idOrCodeOrName: string,
        updates: UpdateProjectInput,
    ): Promise<{ project: Project; changes: string[] } | undefined> {
        const id = await this.resolveId(idOrCodeOrName);
        if (!id) return undefined;
        const existingRows = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
        const existing = existingRows[0];
        if (!existing) return undefined;

        const changedBy = updates.changedBy || "QA Team";
        const now = new Date().toISOString();
        const set: Partial<typeof projects.$inferInsert> = { updatedAt: now, updatedBy: resolveActor(changedBy) };
        const changes: string[] = [];
        const historyEntries: { changedField: string; oldValue: string; newValue: string }[] = [];

        const fieldMap: { inputKey: keyof UpdateProjectInput; col: keyof typeof projects.$inferInsert; label: string }[] = [
            { inputKey: "projectName", col: "name", label: "projectName" },
            { inputKey: "description", col: "description", label: "description" },
            { inputKey: "projectType", col: "type", label: "projectType" },
            { inputKey: "status", col: "status", label: "status" },
        ];

        for (const { inputKey, col, label } of fieldMap) {
            const newValue = updates[inputKey];
            if (newValue === undefined) continue;

            let dbValue: string;
            if (inputKey === "projectType") dbValue = typeToDb(newValue as ProjectType);
            else if (inputKey === "status") dbValue = statusToDb(newValue as ProjectStatus);
            else dbValue = (newValue as string).trim();

            const oldValueStr =
                inputKey === "projectType"
                    ? existing.type
                    : inputKey === "status"
                      ? existing.status
                      : String((existing as Record<string, unknown>)[col]);
            const newValueStr =
                inputKey === "projectType"
                    ? typeToDb(newValue as ProjectType)
                    : inputKey === "status"
                      ? statusToDb(newValue as ProjectStatus)
                      : String(newValue);

            if (oldValueStr !== newValueStr) {
                set[col] = dbValue as never;
                changes.push(label);
                historyEntries.push({ changedField: label, oldValue: String(oldValueStr), newValue: String(newValueStr) });
            }
        }

        // Name uniqueness on rename.
        if (updates.projectName !== undefined && updates.projectName.trim() !== existing.name) {
            const dup = await db
                .select({ id: projects.id })
                .from(projects)
                .where(
                    and(
                        eq(sql`lower(${projects.name})`, updates.projectName.trim().toLowerCase()),
                        isNull(projects.deletedAt),
                        ne(projects.id, id),
                    ),
                )
                .limit(1);
            if (dup.length) throw new Error(`A project with the name "${updates.projectName}" already exists`);
        }

        if (changes.length === 0) {
            return { project: rowToProject(existing), changes: [] };
        }

        // Bump version atomically with the history writes.
        const updated = await db.transaction(async (tx) => {
            const [row] = await tx
                .update(projects)
                .set({ ...set, version: sql`${projects.version} + 1` })
                .where(eq(projects.id, id))
                .returning();
            if (historyEntries.length) {
                await tx.insert(projectHistory).values(
                    historyEntries.map((h) => ({
                        projectId: id,
                        changedField: h.changedField,
                        oldValue: h.oldValue,
                        newValue: h.newValue,
                        changedBy: resolveActor(changedBy),
                    })),
                );
            }
            return row;
        });

        logger.info(`Project updated: ${updated.code} (v${updated.version}), changed: [${changes.join(", ")}]`);
        await activityLogRepository.log({
            action: "project.updated",
            entityType: "project",
            entityId: id,
            projectId: id,
            metadata: { version: updated.version, changes },
        });
        return { project: rowToProject(updated), changes };
    }

    async archive(idOrCodeOrName: string, changedBy?: string): Promise<Project | undefined> {
        const result = await this.update(idOrCodeOrName, { status: "Archived", changedBy });
        return result?.project;
    }

    async restore(idOrCodeOrName: string, changedBy?: string): Promise<Project | undefined> {
        const result = await this.update(idOrCodeOrName, { status: "Active", changedBy });
        return result?.project;
    }

    async getDeleteCheck(idOrCodeOrName: string): Promise<DeleteCheckResult | undefined> {
        const id = await this.resolveId(idOrCodeOrName);
        if (!id) return undefined;
        const [b] = await db
            .select({ n: count() })
            .from(bugs)
            .where(and(eq(bugs.projectId, id), isNull(bugs.deletedAt)));
        const [t] = await db
            .select({ n: count() })
            .from(testCases)
            .where(and(eq(testCases.projectId, id), isNull(testCases.deletedAt)));
        const bugCount = Number(b?.n ?? 0);
        const testCaseCount = Number(t?.n ?? 0);
        const reportCount = 0;
        const warnings: string[] = [];
        if (bugCount > 0) warnings.push(`${bugCount} bug(s) are associated with this project`);
        if (testCaseCount > 0) warnings.push(`${testCaseCount} test case(s) are associated with this project`);
        return { canDelete: bugCount === 0 && testCaseCount === 0 && reportCount === 0, bugCount, testCaseCount, reportCount, warnings };
    }

    async delete(idOrCodeOrName: string, force = false): Promise<{ deleted: boolean; reason?: string }> {
        const id = await this.resolveId(idOrCodeOrName);
        if (!id) return { deleted: false, reason: "Project not found" };
        if (!force) {
            const check = await this.getDeleteCheck(id);
            if (check && !check.canDelete) {
                return {
                    deleted: false,
                    reason: `Cannot delete: ${check.warnings.join("; ")}. Archive the project instead, or delete again with force to remove its bugs and test cases too.`,
                };
            }
        }
        // Force path: bugs.project_id and test_cases.project_id are ON DELETE RESTRICT, so the
        // project can't be removed while any rows reference it (including soft-deleted ones — the FK
        // ignores deleted_at). Remove ALL of the project's test cases + bugs first, then the project,
        // in one transaction. project_history + user_project_assignments cascade; generations set null.
        try {
            await db.transaction(async (tx) => {
                await tx.delete(testCases).where(eq(testCases.projectId, id));
                await tx.delete(bugs).where(eq(bugs.projectId, id));
                await tx.delete(projects).where(eq(projects.id, id));
            });
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            logger.error(`Project delete failed (${id}): ${msg}`);
            return { deleted: false, reason: `Delete failed: ${msg}` };
        }
        logger.info(`Project deleted (force): ${id}`);
        await activityLogRepository.log({
            action: "project.deleted",
            entityType: "project",
            entityId: id,
            projectId: id,
        });
        return { deleted: true };
    }

    async getSummary(): Promise<ProjectSummary> {
        const all = await this.getAll();
        const ids = all.map((p) => p.id);
        const [bugStats, tcCounts] = await Promise.all([
            this.bugStatsByProject(ids),
            this.tcCountsByProject(ids),
        ]);
        let totalBugs = 0;
        let totalTestCases = 0;
        for (const p of all) {
            totalBugs += bugStats[p.id]?.total ?? 0;
            totalTestCases += tcCounts[p.id] ?? 0;
        }
        return {
            totalProjects: all.length,
            activeProjects: all.filter((p) => p.status === "Active").length,
            archivedProjects: all.filter((p) => p.status === "Archived").length,
            totalBugs,
            totalTestCases,
        };
    }

    async getHistory(idOrCodeOrName: string): Promise<ProjectHistoryEntry[]> {
        const id = await this.resolveId(idOrCodeOrName);
        if (!id) return [];
        const rows = await db
            .select()
            .from(projectHistory)
            .where(eq(projectHistory.projectId, id))
            .orderBy(desc(projectHistory.changedAt));
        return rows.map((r) => ({
            id: r.id,
            projectId: r.projectId,
            changedField: r.changedField,
            oldValue: r.oldValue ?? "",
            newValue: r.newValue ?? "",
            changedBy: r.changedBy ?? "",
            changedAt: r.changedAt,
        }));
    }

    // Sample seeding removed — clean foundation (no demo data).
}

export default new SqlProjectRepository();
