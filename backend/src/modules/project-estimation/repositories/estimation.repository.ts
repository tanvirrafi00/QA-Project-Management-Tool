/**
 * Estimation Repository — in-memory implementation (async interface) + persistence selector.
 *
 * Public methods are `async` so this repo shares an identical interface with the SQL implementation
 * (`estimation.repository.sql.ts`). The exported default is selected by `USE_DB_ESTIMATIONS`:
 *   - `USE_DB_ESTIMATIONS=false` (default) → this in-memory repo (volatile; current app behavior).
 *   - `USE_DB_ESTIMATIONS=true`            → the Drizzle/PostgreSQL repo.
 * The service/controller `await` the repository either way.
 *
 * Computed metrics (summary, workload) delegate to `utils/estimation-math.ts` — the single source.
 */

import {
    ProjectVersion,
    EstimationModule,
    ModuleAssignment,
    ModuleEstimation,
    EstimationReviewEvent,
    EstimationHistoryEntry,
    CreateVersionInput,
    CreateModuleInput,
    CreateAssignmentInput,
    CreateEstimationInput,
    UpdateEstimationInput,
    VersionFilter,
    ModuleFilter,
    AssignmentFilter,
    EstimationFilter,
    EstimationProjectSummary,
    EngineerWorkload,
    EstimationStatus,
    CapacityReport,
    CapacityByVersion,
} from '../types';
import {
    totalEffortHours,
    teamCapacityHoursPerDay,
    projectDurationDays,
    utilizationPercent,
    complexityScore,
    riskScore,
    type CapacityInput,
    type EstimateInput,
} from '../utils/estimation-math';
import logger from '../../../shared/logger';
import sqlEstimationRepository from './estimation.repository.sql';

class EstimationRepository {
    private versions: Map<string, ProjectVersion> = new Map();
    private modules: Map<string, EstimationModule> = new Map();
    private assignments: Map<string, ModuleAssignment> = new Map();
    private estimations: Map<string, ModuleEstimation> = new Map();
    private reviewEvents: Map<string, EstimationReviewEvent[]> = new Map();
    private history: Map<string, EstimationHistoryEntry[]> = new Map();

    private id(prefix: string): string {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }

    private now(): string {
        return new Date().toISOString();
    }

    // ── Versions ───────────────────────────────────────

    async createVersion(input: CreateVersionInput): Promise<ProjectVersion> {
        const name = input.name.trim();
        if (!name) throw new Error('Version name is required');

        if (await this.versionNameTaken(input.projectId, name)) {
            throw new Error(`A version named "${name}" already exists in this project`);
        }

        const now = this.now();
        const version: ProjectVersion = {
            id: this.id('ver'),
            projectId: input.projectId,
            name,
            code: input.code?.trim() || undefined,
            status: input.status || 'Draft',
            targetDate: input.targetDate,
            notes: input.notes?.trim() || '',
            createdBy: input.createdBy || 'QA Team',
            createdAt: now,
            updatedAt: now,
            version: 1,
        };
        this.versions.set(version.id, version);
        logger.info(`Estimation version created: ${version.name} (project ${version.projectId})`);
        return version;
    }

    private async versionNameTaken(projectId: string, name: string, excludeId?: string): Promise<boolean> {
        const n = name.trim().toLowerCase();
        for (const [id, v] of this.versions) {
            if (excludeId && id === excludeId) continue;
            if (v.projectId === projectId && v.name.trim().toLowerCase() === n) return true;
        }
        return false;
    }

    async listVersions(filter?: VersionFilter): Promise<ProjectVersion[]> {
        let results = Array.from(this.versions.values());
        if (filter?.projectId) results = results.filter(v => v.projectId === filter.projectId);
        if (filter?.status) results = results.filter(v => v.status === filter.status);
        if (filter?.search) {
            const q = filter.search.toLowerCase();
            results = results.filter(v => v.name.toLowerCase().includes(q) || (v.code ?? '').toLowerCase().includes(q));
        }
        return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }

    async getVersion(id: string): Promise<ProjectVersion | undefined> {
        return this.versions.get(id);
    }

    // ── Modules ────────────────────────────────────────

    async createModule(input: CreateModuleInput): Promise<EstimationModule> {
        const name = input.name.trim();
        if (!name) throw new Error('Module name is required');
        const projectId = input.projectId;
        if (!projectId) throw new Error('Project is required');

        if (await this.moduleNameTaken(projectId, input.versionId, name)) {
            throw new Error(`A module named "${name}" already exists in this scope`);
        }

        const now = this.now();
        const mod: EstimationModule = {
            id: this.id('estmod'),
            versionId: input.versionId,
            projectId,
            name,
            description: input.description?.trim() || '',
            sortOrder: input.sortOrder ?? 0,
            createdBy: input.createdBy || 'QA Team',
            createdAt: now,
            updatedAt: now,
            version: 1,
        };
        this.modules.set(mod.id, mod);
        logger.info(`Estimation module created: ${mod.name} (project ${mod.projectId})`);
        return mod;
    }

    private async moduleNameTaken(projectId: string, versionId: string | undefined, name: string): Promise<boolean> {
        const n = name.trim().toLowerCase();
        for (const m of this.modules.values()) {
            if (m.projectId !== projectId) continue;
            if ((m.versionId ?? undefined) !== (versionId ?? undefined)) continue;
            if (m.name.trim().toLowerCase() === n) return true;
        }
        return false;
    }

    async getModule(id: string): Promise<EstimationModule | undefined> {
        return this.modules.get(id);
    }

    async listModules(filter?: ModuleFilter): Promise<EstimationModule[]> {
        let results = Array.from(this.modules.values());
        if (filter?.projectId) results = results.filter(m => m.projectId === filter.projectId);
        if (filter?.versionId !== undefined) {
            results = results.filter(m => (m.versionId ?? undefined) === filter.versionId);
        }
        if (filter?.search) {
            const q = filter.search.toLowerCase();
            results = results.filter(m => m.name.toLowerCase().includes(q) || m.description.toLowerCase().includes(q));
        }
        return results.sort((a, b) => a.sortOrder - b.sortOrder || b.createdAt.localeCompare(a.createdAt));
    }

    // ── Assignments ────────────────────────────────────

    async createAssignment(input: CreateAssignmentInput): Promise<ModuleAssignment> {
        const mod = await this.getModule(input.moduleId);
        if (!mod) throw new Error('Module not found');

        const projectId = input.projectId || mod.projectId;
        if (await this.assignmentExists(input.moduleId, input.engineerId)) {
            throw new Error('This engineer is already assigned to this module');
        }

        const now = this.now();
        const assignment: ModuleAssignment = {
            id: this.id('asgn'),
            moduleId: input.moduleId,
            engineerId: input.engineerId,
            engineerName: input.engineerName?.trim() || input.engineerId,
            projectId,
            dailyCapacityHours: input.dailyCapacityHours ?? 8,
            role: input.role || 'QA Engineer',
            createdBy: input.createdBy || 'QA Team',
            createdAt: now,
            updatedAt: now,
            version: 1,
        };
        this.assignments.set(assignment.id, assignment);
        logger.info(`Assignment created: module ${assignment.moduleId} → engineer ${assignment.engineerId}`);
        return assignment;
    }

    private async assignmentExists(moduleId: string, engineerId: string): Promise<boolean> {
        for (const a of this.assignments.values()) {
            if (a.moduleId === moduleId && a.engineerId === engineerId) return true;
        }
        return false;
    }

    async getAssignment(id: string): Promise<ModuleAssignment | undefined> {
        return this.assignments.get(id);
    }

    async listAssignments(filter?: AssignmentFilter): Promise<ModuleAssignment[]> {
        let results = Array.from(this.assignments.values());
        if (filter?.moduleId) results = results.filter(a => a.moduleId === filter.moduleId);
        if (filter?.engineerId) results = results.filter(a => a.engineerId === filter.engineerId);
        if (filter?.projectId) results = results.filter(a => a.projectId === filter.projectId);
        return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }

    // ── Estimations ────────────────────────────────────

    async createEstimation(input: CreateEstimationInput): Promise<ModuleEstimation> {
        const mod = await this.getModule(input.moduleId);
        if (!mod) throw new Error('Module not found');

        const projectId = input.projectId || mod.projectId;
        const engineerName = input.engineerName?.trim() || input.engineerId;

        // One live estimate per (module, engineer).
        const existing = await this.getEstimationByModuleEngineer(input.moduleId, input.engineerId);
        if (existing) {
            throw new Error('An estimate already exists for this engineer on this module');
        }

        const now = this.now();
        const estimation: ModuleEstimation = {
            id: this.id('est'),
            assignmentId: input.assignmentId,
            moduleId: input.moduleId,
            engineerId: input.engineerId,
            engineerName,
            projectId,
            testCaseCount: input.testCaseCount,
            estimatedHours: input.estimatedHours,
            complexity: input.complexity,
            riskLevel: input.riskLevel,
            assumptions: input.assumptions?.trim() || '',
            dependencies: input.dependencies ?? [],
            notes: input.notes?.trim() || '',
            status: 'Draft',
            reviewerId: undefined,
            reviewComment: undefined,
            reviewedAt: undefined,
            isFinalApproved: false,
            createdBy: input.createdBy || 'QA Team',
            createdAt: now,
            updatedAt: now,
            version: 1,
        };
        this.estimations.set(estimation.id, estimation);
        logger.info(`Estimation created: module ${estimation.moduleId} by engineer ${estimation.engineerId}`);
        return estimation;
    }

    async getEstimationByModuleEngineer(moduleId: string, engineerId: string): Promise<ModuleEstimation | undefined> {
        for (const e of this.estimations.values()) {
            if (e.moduleId === moduleId && e.engineerId === engineerId) return e;
        }
        return undefined;
    }

    async getEstimation(id: string): Promise<ModuleEstimation | undefined> {
        return this.estimations.get(id);
    }

    async listEstimations(filter?: EstimationFilter): Promise<ModuleEstimation[]> {
        let results = Array.from(this.estimations.values());
        if (filter?.projectId) results = results.filter(e => e.projectId === filter.projectId);
        if (filter?.moduleId) results = results.filter(e => e.moduleId === filter.moduleId);
        if (filter?.engineerId) results = results.filter(e => e.engineerId === filter.engineerId);
        if (filter?.status) results = results.filter(e => e.status === filter.status);
        if (filter?.isFinalApproved !== undefined) results = results.filter(e => e.isFinalApproved === filter.isFinalApproved);
        if (filter?.search) {
            const q = filter.search.toLowerCase();
            results = results.filter(
                e =>
                    e.engineerName.toLowerCase().includes(q) ||
                    e.assumptions.toLowerCase().includes(q) ||
                    e.notes.toLowerCase().includes(q),
            );
        }
        return results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }

    /**
     * Update editable estimate fields with change tracking + history. Status/workflow transitions are
     * handled by the service (Phase 2). Returns undefined when not found.
     */
    async updateEstimation(
        id: string,
        updates: UpdateEstimationInput,
    ): Promise<{ estimation: ModuleEstimation; changes: string[] } | undefined> {
        const existing = this.estimations.get(id);
        if (!existing) return undefined;

        const changedBy = updates.changedBy || 'QA Team';
        const now = this.now();
        const changes: string[] = [];
        const historyEntries: EstimationHistoryEntry[] = [];

        const editableFields: (keyof UpdateEstimationInput)[] = [
            'testCaseCount', 'estimatedHours', 'complexity', 'riskLevel', 'assumptions', 'dependencies', 'notes',
        ];

        for (const field of editableFields) {
            if (updates[field] === undefined) continue;
            const oldValue = String((existing as any)[field] ?? '');
            const newStr = Array.isArray(updates[field]) ? (updates[field] as unknown[]).join(', ') : String(updates[field]);
            if (oldValue !== newStr) {
                changes.push(field);
                historyEntries.push({
                    id: this.id('esthist'),
                    estimationId: existing.id,
                    changedField: field,
                    oldValue,
                    newValue: newStr,
                    changedBy,
                    changedAt: now,
                });
            }
        }

        if (changes.length === 0) {
            return { estimation: existing, changes: [] };
        }

        const updated: ModuleEstimation = {
            ...existing,
            ...(updates.testCaseCount !== undefined && { testCaseCount: updates.testCaseCount }),
            ...(updates.estimatedHours !== undefined && { estimatedHours: updates.estimatedHours }),
            ...(updates.complexity !== undefined && { complexity: updates.complexity }),
            ...(updates.riskLevel !== undefined && { riskLevel: updates.riskLevel }),
            ...(updates.assumptions !== undefined && { assumptions: updates.assumptions.trim() }),
            ...(updates.dependencies !== undefined && { dependencies: updates.dependencies }),
            ...(updates.notes !== undefined && { notes: updates.notes.trim() }),
            id: existing.id,
            updatedAt: now,
            version: existing.version + 1,
        };
        this.estimations.set(id, updated);

        const prev = this.history.get(id) || [];
        this.history.set(id, [...prev, ...historyEntries]);

        return { estimation: updated, changes };
    }

    async getHistory(estimationId: string): Promise<EstimationHistoryEntry[]> {
        return this.history.get(estimationId) || [];
    }

    async getReviewEvents(estimationId: string): Promise<EstimationReviewEvent[]> {
        return this.reviewEvents.get(estimationId) || [];
    }

    // ── Approval workflow ──────────────────────────────

    /** Apply a state transition: set status/reviewer/comment, bump version, append a review event. */
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
        const existing = this.estimations.get(id);
        if (!existing) return undefined;
        const now = this.now();
        const fromStatus = existing.status;
        const updated: ModuleEstimation = {
            ...existing,
            status: params.toStatus,
            reviewerId: params.actorId ?? existing.reviewerId,
            reviewedAt: now,
            reviewComment: params.comment ?? existing.reviewComment,
            updatedAt: now,
            version: existing.version + 1,
        };
        this.estimations.set(id, updated);

        const events = this.reviewEvents.get(id) ?? [];
        events.push({
            id: this.id('rev'),
            estimationId: id,
            fromStatus,
            toStatus: params.toStatus,
            action: params.action,
            actorId: params.actorId,
            actorName: params.actorName,
            comment: params.comment,
            createdAt: now,
        });
        this.reviewEvents.set(id, events);
        return updated;
    }

    /**
     * Mark `id` as the final-approved estimate for its module and clear the flag on every other live
     * estimate of the same module (exactly one final-approved per module).
     */
    async selectFinal(
        id: string,
        params: { actorId?: string; actorName?: string },
    ): Promise<ModuleEstimation | undefined> {
        const target = this.estimations.get(id);
        if (!target) return undefined;
        const now = this.now();
        for (const [eid, e] of this.estimations) {
            if (e.moduleId !== target.moduleId) continue;
            const wantFinal = eid === id;
            if (e.isFinalApproved === wantFinal) continue;
            this.estimations.set(eid, { ...e, isFinalApproved: wantFinal, updatedAt: now, version: e.version + 1 });
        }
        const events = this.reviewEvents.get(id) ?? [];
        events.push({
            id: this.id('rev'),
            estimationId: id,
            fromStatus: target.status,
            toStatus: target.status,
            action: 'select_final',
            actorId: params.actorId,
            actorName: params.actorName,
            createdAt: now,
        });
        this.reviewEvents.set(id, events);
        return this.estimations.get(id);
    }

    /** Estimates awaiting lead review (Submitted or Under Review). */
    async listReviewQueue(projectId: string): Promise<ModuleEstimation[]> {
        const all = await this.listEstimations({ projectId });
        return all.filter((e) => e.status === 'Submitted' || e.status === 'Under Review');
    }

    // ── Computed summary (delegates to estimation-math) ─

    async getProjectSummary(projectId: string): Promise<EstimationProjectSummary> {
        const all = await this.listEstimations({ projectId });
        const modules = await this.listModules({ projectId });
        const assignments = await this.listAssignments({ projectId });

        const finalApproved = all.filter(e => e.isFinalApproved && e.status === 'Approved');
        const estimateInputs: EstimateInput[] = finalApproved;
        const capacities: CapacityInput[] = assignments.map(a => ({
            engineerId: a.engineerId,
            dailyCapacityHours: a.dailyCapacityHours,
        }));

        const totalEffort = totalEffortHours(estimateInputs);
        const teamCapacity = teamCapacityHoursPerDay(capacities);
        const duration = projectDurationDays(totalEffort, teamCapacity);
        const engineers = new Set(assignments.map(a => a.engineerId));
        const approvedModuleIds = new Set(finalApproved.map(e => e.moduleId));

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

    /** Per-engineer workload rows. availableHours = dailyCapacity × projectDurationDays (null when unknown). */
    async getEngineerWorkloads(projectId: string): Promise<EngineerWorkload[]> {
        const summary = await this.getProjectSummary(projectId);
        const estimations = await this.listEstimations({ projectId });
        const assignments = await this.listAssignments({ projectId });

        const byEngineer = new Map<string, { name: string; capacity: number; hours: number; count: number }>();
        for (const a of assignments) {
            if (!byEngineer.has(a.engineerId)) {
                byEngineer.set(a.engineerId, { name: a.engineerName, capacity: a.dailyCapacityHours, hours: 0, count: 0 });
            }
        }
        for (const e of estimations) {
            const row = byEngineer.get(e.engineerId);
            if (row) {
                row.hours += e.estimatedHours ?? 0;
                row.count += 1;
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
        return rows.sort((a, b) => b.assignedHours - a.assignedHours);
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
                label: vid ? (versionLabel.get(vid) ?? 'Version') : 'Unversioned',
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

const memoryRepository = new EstimationRepository();
const useSql = process.env.USE_DB_ESTIMATIONS === 'true';

export default useSql ? sqlEstimationRepository : memoryRepository;
