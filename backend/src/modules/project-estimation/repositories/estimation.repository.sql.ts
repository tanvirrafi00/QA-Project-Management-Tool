/**
 * SQL-backed Estimation Repository (Drizzle / PostgreSQL).
 *
 * Implements the SAME async interface as the in-memory repository so the service/controller are
 * unchanged across the swap (`USE_DB_ESTIMATIONS=true` selects this impl; see `estimation.repository.ts`).
 *
 * - snake_case rows ↔ camelCase domain objects (mapping lives here).
 * - lowercase DB enum labels ↔ display strings.
 * - numeric columns are read as strings by Drizzle → converted to numbers here.
 * - computed metrics delegate to `utils/estimation-math.ts` (same as the in-memory repo).
 */

import { and, asc, desc, eq, ilike, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "../../../shared/db";
import {
    estimationHistory,
    estimationModules,
    estimationReviewEvents,
    moduleAssignments,
    moduleEstimations,
    projectVersions,
} from "../../../shared/db/schema";
import logger from "../../../shared/logger";
import activityLogRepository from "../../../shared/db/repositories/activity-log.repository";
import {
    totalEffortHours,
    teamCapacityHoursPerDay,
    projectDurationDays,
    utilizationPercent,
    complexityScore,
    riskScore,
    type CapacityInput,
    type EstimateInput,
} from "../utils/estimation-math";
import type {
    AssignmentFilter,
    AssignmentRole,
    CreateAssignmentInput,
    CreateEstimationInput,
    CreateModuleInput,
    CreateVersionInput,
    EngineerWorkload,
    EstimationFilter,
    EstimationHistoryEntry,
    EstimationModule,
    EstimationProjectSummary,
    EstimationReviewEvent,
    EstimationStatus,
    ModuleAssignment,
    ModuleEstimation,
    ModuleFilter,
    ProjectVersion,
    ProjectVersionStatus,
    UpdateEstimationInput,
    VersionFilter,
    ComplexityLevel,
    RiskLevel,
    CapacityReport,
    CapacityByVersion,
} from "../types";

// ── enum maps (display string ↔ lowercase DB label) ──

const VERSION_STATUS_TO_DB: Record<ProjectVersionStatus, "draft" | "active" | "locked"> = {
    Draft: "draft", Active: "active", Locked: "locked",
};
const VERSION_STATUS_FROM_DB: Record<string, ProjectVersionStatus> = {
    draft: "Draft", active: "Active", locked: "Locked",
};

const STATUS_TO_DB: Record<
    EstimationStatus,
    "draft" | "submitted" | "under_review" | "approved" | "revision_requested" | "rejected"
> = {
    Draft: "draft",
    Submitted: "submitted",
    "Under Review": "under_review",
    Approved: "approved",
    "Revision Requested": "revision_requested",
    Rejected: "rejected",
};
const STATUS_FROM_DB: Record<string, EstimationStatus> = {
    draft: "Draft",
    submitted: "Submitted",
    under_review: "Under Review",
    approved: "Approved",
    revision_requested: "Revision Requested",
    rejected: "Rejected",
};

const COMPLEXITY_TO_DB: Record<ComplexityLevel, "low" | "medium" | "high" | "critical"> = { Low: "low", Medium: "medium", High: "high", Critical: "critical" };
const COMPLEXITY_FROM_DB: Record<string, ComplexityLevel> = { low: "Low", medium: "Medium", high: "High", critical: "Critical" };

const RISK_TO_DB: Record<RiskLevel, "low" | "medium" | "high"> = { Low: "low", Medium: "medium", High: "high" };
const RISK_FROM_DB: Record<string, RiskLevel> = { low: "Low", medium: "Medium", high: "High" };

const ROLE_TO_DB: Record<AssignmentRole, "qa_engineer" | "qa_lead"> = { "QA Engineer": "qa_engineer", "QA Lead": "qa_lead" };
const ROLE_FROM_DB: Record<string, AssignmentRole> = { qa_engineer: "QA Engineer", qa_lead: "QA Lead", admin: "QA Lead" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Resolve a free-text actor ("QA Team") to null; a real uuid (from the session) passes through. */
function resolveActor(actor?: string): string | null {
    if (actor && UUID_RE.test(actor)) return actor;
    return null;
}

const num = (v: unknown): number | undefined => (v == null ? undefined : Number(v));

// ── row mappers ───────────────────────────────────────

type VersionRow = typeof projectVersions.$inferSelect;
type ModuleRow = typeof estimationModules.$inferSelect;
type AssignmentRow = typeof moduleAssignments.$inferSelect;
type EstimationRow = typeof moduleEstimations.$inferSelect;

function rowToVersion(row: VersionRow): ProjectVersion {
    return {
        id: row.id,
        projectId: row.projectId,
        name: row.name,
        code: row.code ?? undefined,
        status: VERSION_STATUS_FROM_DB[row.status] ?? "Draft",
        targetDate: row.targetDate ?? undefined,
        notes: row.notes,
        createdBy: row.createdBy ?? "",
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        version: row.version,
    };
}

function rowToModule(row: ModuleRow): EstimationModule {
    return {
        id: row.id,
        versionId: row.versionId ?? undefined,
        projectId: row.projectId,
        name: row.name,
        description: row.description,
        sortOrder: row.sortOrder,
        createdBy: row.createdBy ?? "",
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        version: row.version,
    };
}

function rowToAssignment(row: AssignmentRow): ModuleAssignment {
    return {
        id: row.id,
        moduleId: row.moduleId,
        engineerId: row.engineerId,
        engineerName: row.engineerName,
        projectId: row.projectId,
        dailyCapacityHours: num(row.dailyCapacityHours) ?? 8,
        role: ROLE_FROM_DB[row.role] ?? "QA Engineer",
        createdBy: row.createdBy ?? "",
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        version: row.version,
    };
}

function rowToEstimation(row: EstimationRow): ModuleEstimation {
    return {
        id: row.id,
        assignmentId: row.assignmentId ?? undefined,
        moduleId: row.moduleId,
        engineerId: row.engineerId,
        engineerName: row.engineerName,
        projectId: row.projectId,
        testCaseCount: row.testCaseCount ?? undefined,
        estimatedHours: num(row.estimatedHours),
        complexity: row.complexity ? COMPLEXITY_FROM_DB[row.complexity] : undefined,
        riskLevel: row.riskLevel ? RISK_FROM_DB[row.riskLevel] : undefined,
        assumptions: row.assumptions,
        dependencies: row.dependencies,
        notes: row.notes,
        status: STATUS_FROM_DB[row.status] ?? "Draft",
        reviewerId: row.reviewerId ?? undefined,
        reviewComment: row.reviewComment ?? undefined,
        reviewedAt: row.reviewedAt ?? undefined,
        isFinalApproved: row.isFinalApproved,
        createdBy: row.createdBy ?? "",
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        version: row.version,
    };
}

class SqlEstimationRepository {
    // ── Versions ───────────────────────────────────────

    async createVersion(input: CreateVersionInput): Promise<ProjectVersion> {
        const name = input.name.trim();
        if (!name) throw new Error("Version name is required");

        const clash = await db
            .select({ id: projectVersions.id })
            .from(projectVersions)
            .where(
                and(
                    eq(projectVersions.projectId, input.projectId),
                    eq(sql`lower(${projectVersions.name})`, name.toLowerCase()),
                    isNull(projectVersions.deletedAt),
                ),
            )
            .limit(1);
        if (clash.length) throw new Error(`A version named "${name}" already exists in this project`);

        const [row] = await db
            .insert(projectVersions)
            .values({
                projectId: input.projectId,
                name,
                code: input.code?.trim() || null,
                status: VERSION_STATUS_TO_DB[input.status || "Draft"],
                targetDate: input.targetDate ?? null,
                notes: input.notes?.trim() || "",
                createdBy: resolveActor(input.createdBy),
                updatedBy: resolveActor(input.createdBy),
            })
            .returning();
        logger.info(`Estimation version created: ${row.name} (project ${row.projectId})`);
        await activityLogRepository.log({
            action: "estimation.version_created",
            entityType: "project_version",
            entityId: row.id,
            projectId: row.projectId,
            metadata: { name: row.name },
        });
        return rowToVersion(row);
    }

    async getVersion(id: string): Promise<ProjectVersion | undefined> {
        const rows = await db.select().from(projectVersions).where(eq(projectVersions.id, id)).limit(1);
        return rows[0] ? rowToVersion(rows[0]) : undefined;
    }

    async listVersions(filter?: VersionFilter): Promise<ProjectVersion[]> {
        const conds = [isNull(projectVersions.deletedAt)];
        if (filter?.projectId) conds.push(eq(projectVersions.projectId, filter.projectId));
        if (filter?.status) conds.push(eq(projectVersions.status, VERSION_STATUS_TO_DB[filter.status]));
        if (filter?.search) {
            const q = `%${filter.search.toLowerCase()}%`;
            conds.push(or(ilike(projectVersions.name, q), ilike(projectVersions.code, q))!);
        }
        const rows = await db
            .select()
            .from(projectVersions)
            .where(and(...conds))
            .orderBy(desc(projectVersions.createdAt));
        return rows.map(rowToVersion);
    }

    // ── Modules ────────────────────────────────────────

    async createModule(input: CreateModuleInput): Promise<EstimationModule> {
        const name = input.name.trim();
        if (!name) throw new Error("Module name is required");
        if (!input.projectId) throw new Error("Project is required");

        const [row] = await db
            .insert(estimationModules)
            .values({
                versionId: input.versionId ?? null,
                projectId: input.projectId,
                name,
                description: input.description?.trim() || "",
                sortOrder: input.sortOrder ?? 0,
                createdBy: resolveActor(input.createdBy),
                updatedBy: resolveActor(input.createdBy),
            })
            .returning();
        logger.info(`Estimation module created: ${row.name} (project ${row.projectId})`);
        return rowToModule(row);
    }

    async getModule(id: string): Promise<EstimationModule | undefined> {
        const rows = await db.select().from(estimationModules).where(eq(estimationModules.id, id)).limit(1);
        return rows[0] ? rowToModule(rows[0]) : undefined;
    }

    async listModules(filter?: ModuleFilter): Promise<EstimationModule[]> {
        const conds = [isNull(estimationModules.deletedAt)];
        if (filter?.projectId) conds.push(eq(estimationModules.projectId, filter.projectId));
        if (filter?.versionId !== undefined) {
            if (filter.versionId === null || filter.versionId === "") {
                conds.push(isNull(estimationModules.versionId));
            } else {
                conds.push(eq(estimationModules.versionId, filter.versionId));
            }
        }
        if (filter?.search) {
            const q = `%${filter.search.toLowerCase()}%`;
            conds.push(or(ilike(estimationModules.name, q), ilike(estimationModules.description, q))!);
        }
        const rows = await db
            .select()
            .from(estimationModules)
            .where(and(...conds))
            .orderBy(asc(estimationModules.sortOrder), desc(estimationModules.createdAt));
        return rows.map(rowToModule);
    }

    // ── Assignments ────────────────────────────────────

    async createAssignment(input: CreateAssignmentInput): Promise<ModuleAssignment> {
        const mod = await this.getModule(input.moduleId);
        if (!mod) throw new Error("Module not found");
        const projectId = input.projectId || mod.projectId;

        const dup = await db
            .select({ id: moduleAssignments.id })
            .from(moduleAssignments)
            .where(
                and(
                    eq(moduleAssignments.moduleId, input.moduleId),
                    eq(moduleAssignments.engineerId, input.engineerId),
                    isNull(moduleAssignments.deletedAt),
                ),
            )
            .limit(1);
        if (dup.length) throw new Error("This engineer is already assigned to this module");

        const [row] = await db
            .insert(moduleAssignments)
            .values({
                moduleId: input.moduleId,
                engineerId: input.engineerId,
                engineerName: input.engineerName?.trim() || input.engineerId,
                projectId,
                dailyCapacityHours: String(input.dailyCapacityHours ?? 8),
                role: ROLE_TO_DB[input.role || "QA Engineer"],
                createdBy: resolveActor(input.createdBy),
                updatedBy: resolveActor(input.createdBy),
            })
            .returning();
        logger.info(`Assignment created: module ${row.moduleId} → engineer ${row.engineerId}`);
        return rowToAssignment(row);
    }

    async getAssignment(id: string): Promise<ModuleAssignment | undefined> {
        const rows = await db.select().from(moduleAssignments).where(eq(moduleAssignments.id, id)).limit(1);
        return rows[0] ? rowToAssignment(rows[0]) : undefined;
    }

    async listAssignments(filter?: AssignmentFilter): Promise<ModuleAssignment[]> {
        const conds = [isNull(moduleAssignments.deletedAt)];
        if (filter?.moduleId) conds.push(eq(moduleAssignments.moduleId, filter.moduleId));
        if (filter?.engineerId) conds.push(eq(moduleAssignments.engineerId, filter.engineerId));
        if (filter?.projectId) conds.push(eq(moduleAssignments.projectId, filter.projectId));
        const rows = await db
            .select()
            .from(moduleAssignments)
            .where(and(...conds))
            .orderBy(desc(moduleAssignments.createdAt));
        return rows.map(rowToAssignment);
    }

    // ── Estimations ────────────────────────────────────

    async createEstimation(input: CreateEstimationInput): Promise<ModuleEstimation> {
        const mod = await this.getModule(input.moduleId);
        if (!mod) throw new Error("Module not found");
        const projectId = input.projectId || mod.projectId;
        const engineerName = input.engineerName?.trim() || input.engineerId;

        const existing = await db
            .select({ id: moduleEstimations.id })
            .from(moduleEstimations)
            .where(
                and(
                    eq(moduleEstimations.moduleId, input.moduleId),
                    eq(moduleEstimations.engineerId, input.engineerId),
                    isNull(moduleEstimations.deletedAt),
                ),
            )
            .limit(1);
        if (existing.length) throw new Error("An estimate already exists for this engineer on this module");

        const [row] = await db
            .insert(moduleEstimations)
            .values({
                assignmentId: input.assignmentId ?? null,
                moduleId: input.moduleId,
                engineerId: input.engineerId,
                engineerName,
                projectId,
                testCaseCount: input.testCaseCount ?? null,
                estimatedHours: input.estimatedHours != null ? String(input.estimatedHours) : null,
                complexity: input.complexity ? COMPLEXITY_TO_DB[input.complexity] : null,
                riskLevel: input.riskLevel ? RISK_TO_DB[input.riskLevel] : null,
                assumptions: input.assumptions?.trim() || "",
                dependencies: input.dependencies ?? [],
                notes: input.notes?.trim() || "",
                status: "draft",
                isFinalApproved: false,
                createdBy: resolveActor(input.createdBy),
                updatedBy: resolveActor(input.createdBy),
            })
            .returning();
        logger.info(`Estimation created: module ${row.moduleId} by engineer ${row.engineerId}`);
        return rowToEstimation(row);
    }

    async getEstimation(id: string): Promise<ModuleEstimation | undefined> {
        const rows = await db.select().from(moduleEstimations).where(eq(moduleEstimations.id, id)).limit(1);
        return rows[0] ? rowToEstimation(rows[0]) : undefined;
    }

    async getEstimationByModuleEngineer(moduleId: string, engineerId: string): Promise<ModuleEstimation | undefined> {
        const rows = await db
            .select()
            .from(moduleEstimations)
            .where(
                and(
                    eq(moduleEstimations.moduleId, moduleId),
                    eq(moduleEstimations.engineerId, engineerId),
                    isNull(moduleEstimations.deletedAt),
                ),
            )
            .limit(1);
        return rows[0] ? rowToEstimation(rows[0]) : undefined;
    }

    async listEstimations(filter?: EstimationFilter): Promise<ModuleEstimation[]> {
        const conds = [isNull(moduleEstimations.deletedAt)];
        if (filter?.projectId) conds.push(eq(moduleEstimations.projectId, filter.projectId));
        if (filter?.moduleId) conds.push(eq(moduleEstimations.moduleId, filter.moduleId));
        if (filter?.engineerId) conds.push(eq(moduleEstimations.engineerId, filter.engineerId));
        if (filter?.status) conds.push(eq(moduleEstimations.status, STATUS_TO_DB[filter.status]));
        if (filter?.isFinalApproved !== undefined) conds.push(eq(moduleEstimations.isFinalApproved, filter.isFinalApproved));
        if (filter?.search) {
            const q = `%${filter.search.toLowerCase()}%`;
            conds.push(
                or(
                    ilike(moduleEstimations.engineerName, q),
                    ilike(moduleEstimations.assumptions, q),
                    ilike(moduleEstimations.notes, q),
                )!,
            );
        }
        const rows = await db
            .select()
            .from(moduleEstimations)
            .where(and(...conds))
            .orderBy(desc(moduleEstimations.updatedAt));
        return rows.map(rowToEstimation);
    }

    async updateEstimation(
        id: string,
        updates: UpdateEstimationInput,
    ): Promise<{ estimation: ModuleEstimation; changes: string[] } | undefined> {
        const existingRows = await db.select().from(moduleEstimations).where(eq(moduleEstimations.id, id)).limit(1);
        const existing = existingRows[0];
        if (!existing) return undefined;

        const changedBy = updates.changedBy || "QA Team";
        const now = new Date().toISOString();
        const set: Partial<typeof moduleEstimations.$inferInsert> = { updatedAt: now, updatedBy: resolveActor(changedBy) };
        const changes: string[] = [];
        const historyEntries: { changedField: string; oldValue: string; newValue: string }[] = [];

        const fieldMap: {
            inputKey: keyof UpdateEstimationInput;
            apply: (v: any) => any;
            dbValue: () => any;
            currentDb: () => string;
        }[] = [
            { inputKey: "testCaseCount", apply: (v) => v, dbValue: () => updates.testCaseCount ?? null, currentDb: () => String(existing.testCaseCount ?? "") },
            { inputKey: "estimatedHours", apply: () => (updates.estimatedHours != null ? String(updates.estimatedHours) : null), dbValue: () => null, currentDb: () => String(existing.estimatedHours ?? "") },
            { inputKey: "complexity", apply: () => (updates.complexity ? COMPLEXITY_TO_DB[updates.complexity] : null), dbValue: () => null, currentDb: () => String(existing.complexity ?? "") },
            { inputKey: "riskLevel", apply: () => (updates.riskLevel ? RISK_TO_DB[updates.riskLevel] : null), dbValue: () => null, currentDb: () => String(existing.riskLevel ?? "") },
            { inputKey: "assumptions", apply: (v) => (v as string).trim(), dbValue: () => null, currentDb: () => existing.assumptions },
            { inputKey: "notes", apply: (v) => (v as string).trim(), dbValue: () => null, currentDb: () => existing.notes },
            {
                inputKey: "dependencies",
                apply: (v) => v as string[],
                dbValue: () => null,
                currentDb: () => (existing.dependencies ?? []).join(", "),
            },
        ];

        const colFor: Record<keyof UpdateEstimationInput, keyof typeof moduleEstimations.$inferInsert> = {
            testCaseCount: "testCaseCount",
            estimatedHours: "estimatedHours",
            complexity: "complexity",
            riskLevel: "riskLevel",
            assumptions: "assumptions",
            dependencies: "dependencies",
            notes: "notes",
            changedBy: "updatedBy",
        };

        for (const f of fieldMap) {
            const v = updates[f.inputKey];
            if (v === undefined) continue;
            const newDb = f.apply(v);
            const newStr = Array.isArray(newDb) ? newDb.join(", ") : String(newDb ?? "");
            if (f.currentDb() !== newStr) {
                set[colFor[f.inputKey]] = newDb as never;
                changes.push(f.inputKey as string);
                historyEntries.push({ changedField: f.inputKey as string, oldValue: f.currentDb(), newValue: newStr });
            }
        }

        if (changes.length === 0) {
            return { estimation: rowToEstimation(existing), changes: [] };
        }

        const updated = await db.transaction(async (tx) => {
            const [row] = await tx
                .update(moduleEstimations)
                .set({ ...set, version: sql`${moduleEstimations.version} + 1` })
                .where(eq(moduleEstimations.id, id))
                .returning();
            if (historyEntries.length) {
                await tx.insert(estimationHistory).values(
                    historyEntries.map((h) => ({
                        estimationId: id,
                        changedField: h.changedField,
                        oldValue: h.oldValue,
                        newValue: h.newValue,
                        changedBy: resolveActor(changedBy),
                    })),
                );
            }
            return row;
        });

        logger.info(`Estimation updated: ${updated.id} (v${updated.version}), changed: [${changes.join(", ")}]`);
        return { estimation: rowToEstimation(updated), changes };
    }

    async getHistory(estimationId: string): Promise<EstimationHistoryEntry[]> {
        const rows = await db
            .select()
            .from(estimationHistory)
            .where(eq(estimationHistory.estimationId, estimationId))
            .orderBy(desc(estimationHistory.changedAt));
        return rows.map((r) => ({
            id: r.id,
            estimationId: r.estimationId,
            changedField: r.changedField,
            oldValue: r.oldValue ?? "",
            newValue: r.newValue ?? "",
            changedBy: r.changedBy ?? "",
            changedAt: r.changedAt,
        }));
    }

    async getReviewEvents(estimationId: string): Promise<EstimationReviewEvent[]> {
        const rows = await db
            .select()
            .from(estimationReviewEvents)
            .where(eq(estimationReviewEvents.estimationId, estimationId))
            .orderBy(desc(estimationReviewEvents.createdAt));
        return rows.map((r) => ({
            id: r.id,
            estimationId: r.estimationId,
            fromStatus: r.fromStatus ?? undefined,
            toStatus: r.toStatus ?? undefined,
            action: r.action,
            actorId: r.actorId ?? undefined,
            actorName: r.actorName ?? undefined,
            comment: r.comment ?? undefined,
            createdAt: r.createdAt,
        }));
    }

    // ── Approval workflow ──────────────────────────────

    async applyTransition(
        id: string,
        params: {
            toStatus: EstimationStatus;
            action: string;
            actorId?: string;
            actorName?: string;
            comment?: string;
        },
    ): Promise<ModuleEstimation | undefined> {
        const existingRows = await db.select().from(moduleEstimations).where(eq(moduleEstimations.id, id)).limit(1);
        const existing = existingRows[0];
        if (!existing) return undefined;
        const toStatusDb = STATUS_TO_DB[params.toStatus];
        const now = new Date().toISOString();
        const reviewer = resolveActor(params.actorId);
        const updated = await db.transaction(async (tx) => {
            const [row] = await tx
                .update(moduleEstimations)
                .set({
                    status: toStatusDb,
                    reviewerId: reviewer ?? existing.reviewerId,
                    reviewedAt: now,
                    reviewComment: params.comment ?? existing.reviewComment,
                    updatedAt: now,
                    updatedBy: reviewer,
                    version: sql`${moduleEstimations.version} + 1`,
                })
                .where(eq(moduleEstimations.id, id))
                .returning();
            await tx.insert(estimationReviewEvents).values({
                estimationId: id,
                fromStatus: existing.status,
                toStatus: toStatusDb,
                action: params.action,
                actorId: reviewer,
                actorName: params.actorName ?? null,
                comment: params.comment ?? null,
            });
            return row;
        });
        return rowToEstimation(updated);
    }

    async selectFinal(
        id: string,
        params: { actorId?: string; actorName?: string },
    ): Promise<ModuleEstimation | undefined> {
        const existingRows = await db.select().from(moduleEstimations).where(eq(moduleEstimations.id, id)).limit(1);
        const existing = existingRows[0];
        if (!existing) return undefined;
        const now = new Date().toISOString();
        const reviewer = resolveActor(params.actorId);
        await db.transaction(async (tx) => {
            // Clear the flag on every other live estimate of the same module.
            await tx
                .update(moduleEstimations)
                .set({ isFinalApproved: false, updatedAt: now })
                .where(
                    and(
                        eq(moduleEstimations.moduleId, existing.moduleId),
                        ne(moduleEstimations.id, id),
                        isNull(moduleEstimations.deletedAt),
                    ),
                );
            // Set the flag on the chosen estimate.
            await tx
                .update(moduleEstimations)
                .set({
                    isFinalApproved: true,
                    updatedAt: now,
                    updatedBy: reviewer,
                    version: sql`${moduleEstimations.version} + 1`,
                })
                .where(eq(moduleEstimations.id, id));
            await tx.insert(estimationReviewEvents).values({
                estimationId: id,
                fromStatus: existing.status,
                toStatus: existing.status,
                action: "select_final",
                actorId: reviewer,
                actorName: params.actorName ?? null,
                comment: null,
            });
        });
        const rows = await db.select().from(moduleEstimations).where(eq(moduleEstimations.id, id)).limit(1);
        return rows[0] ? rowToEstimation(rows[0]) : undefined;
    }

    async listReviewQueue(projectId: string): Promise<ModuleEstimation[]> {
        const rows = await db
            .select()
            .from(moduleEstimations)
            .where(
                and(
                    eq(moduleEstimations.projectId, projectId),
                    inArray(moduleEstimations.status, ["submitted", "under_review"]),
                    isNull(moduleEstimations.deletedAt),
                ),
            )
            .orderBy(desc(moduleEstimations.updatedAt));
        return rows.map(rowToEstimation);
    }

    // ── Computed summary (delegates to estimation-math) ─

    async getProjectSummary(projectId: string): Promise<EstimationProjectSummary> {
        const [all, modules, assignments] = await Promise.all([
            this.listEstimations({ projectId }),
            this.listModules({ projectId }),
            this.listAssignments({ projectId }),
        ]);

        const finalApproved = all.filter((e) => e.isFinalApproved && e.status === "Approved");
        const estimateInputs: EstimateInput[] = finalApproved;
        const capacities: CapacityInput[] = assignments.map((a) => ({
            engineerId: a.engineerId,
            dailyCapacityHours: a.dailyCapacityHours,
        }));

        const totalEffort = totalEffortHours(estimateInputs);
        const teamCapacity = teamCapacityHoursPerDay(capacities);
        const duration = projectDurationDays(totalEffort, teamCapacity);
        const engineers = new Set(assignments.map((a) => a.engineerId));
        const approvedModuleIds = new Set(finalApproved.map((e) => e.moduleId));

        return {
            projectId,
            totalEffortHours: totalEffort,
            estimatedDurationDays: duration,
            teamCapacityHoursPerDay: teamCapacity,
            moduleCount: modules.length,
            approvedModuleCount: approvedModuleIds.size,
            totalEstimations: all.length,
            approvedEstimations: finalApproved.length,
            finalApprovedEffortHours: totalEffort,
            engineerCount: engineers.size,
            complexityScore: complexityScore(estimateInputs),
            riskScore: riskScore(estimateInputs),
        };
    }

    async getEngineerWorkloads(projectId: string): Promise<EngineerWorkload[]> {
        const [summary, estimations, assignments] = await Promise.all([
            this.getProjectSummary(projectId),
            this.listEstimations({ projectId }),
            this.listAssignments({ projectId }),
        ]);

        const byEngineer = new Map<string, { name: string; capacity: number; hours: number; count: number }>();
        for (const a of assignments) {
            if (!byEngineer.has(a.engineerId)) {
                byEngineer.set(a.engineerId, { name: a.engineerName, capacity: a.dailyCapacityHours, hours: 0, count: 0 });
            }
        }
        for (const e of estimations) {
            const r = byEngineer.get(e.engineerId);
            if (r) {
                r.hours += e.estimatedHours ?? 0;
                r.count += 1;
            } else {
                byEngineer.set(e.engineerId, { name: e.engineerName, capacity: 0, hours: e.estimatedHours ?? 0, count: 1 });
            }
        }

        const duration = summary.estimatedDurationDays;
        const rows: EngineerWorkload[] = [];
        for (const [engineerId, r] of byEngineer) {
            const available = duration != null ? r.capacity * duration : 0;
            rows.push({
                engineerId,
                engineerName: r.name,
                assignedHours: Math.round(r.hours * 100) / 100,
                dailyCapacityHours: r.capacity,
                utilizationPercent: utilizationPercent(r.hours, available),
                estimationCount: r.count,
            });
        }
        return rows.sort((x, y) => y.assignedHours - x.assignedHours);
    }

    /** Capacity-planning report (drives the Capacity tab charts). All metrics via estimation-math. */
    async getCapacityReport(projectId: string): Promise<CapacityReport> {
        const round2 = (n: number) => Math.round(n * 100) / 100;
        const [summary, engineers, versions, modules, assignments, estimations] = await Promise.all([
            this.getProjectSummary(projectId),
            this.getEngineerWorkloads(projectId),
            this.listVersions({ projectId }),
            this.listModules({ projectId }),
            this.listAssignments({ projectId }),
            this.listEstimations({ projectId }),
        ]);

        const duration = summary.estimatedDurationDays;
        const totalAssigned = round2(engineers.reduce((acc, e) => acc + e.assignedHours, 0));
        const available = duration != null ? summary.teamCapacityHoursPerDay * duration : 0;
        const overall = utilizationPercent(totalAssigned, available);

        const versionLabel = new Map<string, string>();
        for (const v of versions) versionLabel.set(v.id, v.name);

        const groups = new Map<string | null, Set<string>>();
        for (const m of modules) {
            const key = m.versionId ?? null;
            const set = groups.get(key) ?? new Set<string>();
            set.add(m.id);
            groups.set(key, set);
        }

        const byVersion: CapacityByVersion[] = [];
        for (const [vid, moduleIds] of groups) {
            const ests = estimations.filter((e) => moduleIds.has(e.moduleId));
            const assigned = round2(ests.reduce((acc, e) => acc + (e.estimatedHours ?? 0), 0));
            const caps = assignments
                .filter((a) => moduleIds.has(a.moduleId))
                .map((a) => ({ engineerId: a.engineerId, dailyCapacityHours: a.dailyCapacityHours }));
            const cap = teamCapacityHoursPerDay(caps);
            byVersion.push({
                versionId: vid,
                label: vid ? (versionLabel.get(vid) ?? "Version") : "Unversioned",
                assignedHours: assigned,
                capacityHoursPerDay: cap,
                utilizationPercent: utilizationPercent(assigned, duration != null ? cap * duration : 0),
                estimateCount: ests.length,
            });
        }
        byVersion.sort((a, b) => a.label.localeCompare(b.label));

        return {
            projectId,
            teamCapacityHoursPerDay: summary.teamCapacityHoursPerDay,
            totalAssignedHours: totalAssigned,
            availableHours: round2(available),
            durationDays: duration,
            overallUtilizationPercent: overall,
            engineerCount: engineers.length,
            engineers,
            byVersion,
        };
    }
}

export default new SqlEstimationRepository();
