/**
 * Estimation Service
 * Business logic, validation and orchestration for the project estimation module.
 * Sits between the controller and the repository (in-memory or SQL via `USE_DB_ESTIMATIONS`).
 *
 * The approval state machine (submit/approve/reject/request-revision/resubmit/select-final) lands in
 * Phase 2; Phase 1 covers CRUD + computed summary. Owner-only edits are enforced here (RBAC-ready):
 * when an `actor` user id is supplied (auth on), only the owner / lead / admin may modify an estimate.
 */

import estimationRepository from '../repositories/estimation.repository';
import {
    ProjectVersion,
    EstimationModule,
    ModuleAssignment,
    ModuleEstimation,
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
    EstimationHistoryEntry,
    EstimationReviewEvent,
    ComplexityLevel,
    RiskLevel,
    AssignmentRole,
    ProjectVersionStatus,
    EstimationStatus,
    CapacityReport,
} from '../types';
import logger from '../../../shared/logger';

const VALID_COMPLEXITY: ComplexityLevel[] = ['Low', 'Medium', 'High', 'Critical'];
const VALID_RISK: RiskLevel[] = ['Low', 'Medium', 'High'];
const VALID_ROLES: AssignmentRole[] = ['QA Engineer', 'QA Lead'];
const VALID_VERSION_STATUS: ProjectVersionStatus[] = ['Draft', 'Active', 'Locked'];

export interface Actor {
    id?: string;
    name?: string;
    role?: string;
}

export const estimationService = {
    // ── Versions ───────────────────────────────────────

    async createVersion(input: CreateVersionInput): Promise<ProjectVersion> {
        if (!input.projectId?.trim()) throw new Error('Project is required');
        if (!input.name?.trim()) throw new Error('Version name is required');
        if (input.status && !VALID_VERSION_STATUS.includes(input.status)) {
            throw new Error('Invalid version status');
        }
        return estimationRepository.createVersion(input);
    },

    async listVersions(filter?: VersionFilter): Promise<ProjectVersion[]> {
        return estimationRepository.listVersions(filter);
    },

    async getVersion(id: string): Promise<ProjectVersion> {
        const v = await estimationRepository.getVersion(id);
        if (!v) throw new Error('Version not found');
        return v;
    },

    // ── Modules ────────────────────────────────────────

    async createModule(input: CreateModuleInput): Promise<EstimationModule> {
        if (!input.projectId?.trim()) throw new Error('Project is required');
        if (!input.name?.trim()) throw new Error('Module name is required');
        return estimationRepository.createModule(input);
    },

    async listModules(filter?: ModuleFilter): Promise<EstimationModule[]> {
        return estimationRepository.listModules(filter);
    },

    async getModule(id: string): Promise<EstimationModule> {
        const m = await estimationRepository.getModule(id);
        if (!m) throw new Error('Module not found');
        return m;
    },

    // ── Assignments ────────────────────────────────────

    async createAssignment(input: CreateAssignmentInput): Promise<ModuleAssignment> {
        if (!input.moduleId?.trim()) throw new Error('Module is required');
        if (!input.engineerId?.trim()) throw new Error('Engineer is required');
        if (input.role && !VALID_ROLES.includes(input.role)) throw new Error('Invalid assignment role');
        if (input.dailyCapacityHours !== undefined && input.dailyCapacityHours <= 0) {
            throw new Error('Daily capacity must be greater than 0');
        }
        return estimationRepository.createAssignment(input);
    },

    async listAssignments(filter?: AssignmentFilter): Promise<ModuleAssignment[]> {
        return estimationRepository.listAssignments(filter);
    },

    async getAssignment(id: string): Promise<ModuleAssignment> {
        const a = await estimationRepository.getAssignment(id);
        if (!a) throw new Error('Assignment not found');
        return a;
    },

    // ── Estimations ────────────────────────────────────

    async createEstimation(input: CreateEstimationInput): Promise<ModuleEstimation> {
        if (!input.moduleId?.trim()) throw new Error('Module is required');
        if (!input.engineerId?.trim()) throw new Error('Engineer is required');
        if (input.complexity && !VALID_COMPLEXITY.includes(input.complexity)) {
            throw new Error('Invalid complexity value');
        }
        if (input.riskLevel && !VALID_RISK.includes(input.riskLevel)) {
            throw new Error('Invalid risk level value');
        }
        if (input.estimatedHours !== undefined && input.estimatedHours < 0) {
            throw new Error('Estimated hours cannot be negative');
        }
        if (input.testCaseCount !== undefined && input.testCaseCount < 0) {
            throw new Error('Test case count cannot be negative');
        }
        return estimationRepository.createEstimation(input);
    },

    async getEstimation(id: string): Promise<ModuleEstimation> {
        const e = await estimationRepository.getEstimation(id);
        if (!e) throw new Error('Estimation not found');
        return e;
    },

    async updateEstimation(
        id: string,
        updates: UpdateEstimationInput,
        actor?: Actor,
    ): Promise<{ estimation: ModuleEstimation; changes: string[] }> {
        const existing = await estimationRepository.getEstimation(id);
        if (!existing) throw new Error('Estimation not found');

        // Owner-only edit (RBAC-ready): engineers may edit only their own; leads/admins may edit any.
        assertCanModify(existing, actor);

        if (updates.complexity && !VALID_COMPLEXITY.includes(updates.complexity)) {
            throw new Error('Invalid complexity value');
        }
        if (updates.riskLevel && !VALID_RISK.includes(updates.riskLevel)) {
            throw new Error('Invalid risk level value');
        }
        if (updates.estimatedHours !== undefined && updates.estimatedHours < 0) {
            throw new Error('Estimated hours cannot be negative');
        }
        if (updates.testCaseCount !== undefined && updates.testCaseCount < 0) {
            throw new Error('Test case count cannot be negative');
        }

        const result = await estimationRepository.updateEstimation(id, {
            ...updates,
            changedBy: actor?.id ?? updates.changedBy ?? 'QA Team',
        });
        if (!result) throw new Error('Estimation not found');
        logger.info(`Estimation updated: ${result.estimation.id} (v${result.estimation.version})`);
        return result;
    },

    async listEstimations(filter?: EstimationFilter): Promise<ModuleEstimation[]> {
        return estimationRepository.listEstimations(filter);
    },

    // ── Approval workflow ──────────────────────────────

    /** Engineer submits a Draft estimate (owner or lead/admin). */
    async submit(id: string, actor?: Actor): Promise<ModuleEstimation> {
        const e = await estimationRepository.getEstimation(id);
        if (!e) throw new Error('Estimation not found');
        assertCanModify(e, actor);
        if (e.status !== 'Draft') {
            throw new Error(`Only Draft estimations can be submitted (current: ${e.status})`);
        }
        return requireResult(
            estimationRepository.applyTransition(id, { toStatus: 'Submitted', action: 'submit', ...actorFields(actor) }),
        );
    },

    /** Engineer resubmits after a revision request (owner or lead/admin). */
    async resubmit(id: string, actor?: Actor): Promise<ModuleEstimation> {
        const e = await estimationRepository.getEstimation(id);
        if (!e) throw new Error('Estimation not found');
        assertCanModify(e, actor);
        if (e.status !== 'Revision Requested') {
            throw new Error(`Only estimations with a revision requested can be resubmitted (current: ${e.status})`);
        }
        return requireResult(
            estimationRepository.applyTransition(id, { toStatus: 'Submitted', action: 'resubmit', ...actorFields(actor) }),
        );
    },

    async approve(id: string, actor: Actor | undefined, comment?: string): Promise<ModuleEstimation> {
        requireLead(actor);
        const e = await mustBeReviewable(id);
        return requireResult(
            estimationRepository.applyTransition(id, { toStatus: 'Approved', action: 'approve', comment, ...actorFields(actor) }),
        );
    },

    async requestRevision(id: string, actor: Actor | undefined, comment?: string): Promise<ModuleEstimation> {
        requireLead(actor);
        const e = await mustBeReviewable(id);
        return requireResult(
            estimationRepository.applyTransition(id, {
                toStatus: 'Revision Requested', action: 'request_revision', comment, ...actorFields(actor),
            }),
        );
    },

    async reject(id: string, actor: Actor | undefined, comment?: string): Promise<ModuleEstimation> {
        requireLead(actor);
        const e = await mustBeReviewable(id);
        return requireResult(
            estimationRepository.applyTransition(id, { toStatus: 'Rejected', action: 'reject', comment, ...actorFields(actor) }),
        );
    },

    async reopen(id: string, actor: Actor | undefined): Promise<ModuleEstimation> {
        requireLead(actor);
        const e = await estimationRepository.getEstimation(id);
        if (!e) throw new Error('Estimation not found');
        if (e.status !== 'Approved') throw new Error('Only approved estimations can be reopened');
        return requireResult(
            estimationRepository.applyTransition(id, { toStatus: 'Under Review', action: 'reopen', ...actorFields(actor) }),
        );
    },

    /** Lead/Admin marks one approved estimate as the final value for its module. */
    async selectFinal(id: string, actor: Actor | undefined): Promise<ModuleEstimation> {
        requireLead(actor);
        const e = await estimationRepository.getEstimation(id);
        if (!e) throw new Error('Estimation not found');
        if (e.status !== 'Approved') {
            throw new Error('Only approved estimations can be selected as the final value');
        }
        const result = await estimationRepository.selectFinal(id, actorFields(actor));
        if (!result) throw new Error('Estimation not found');
        logger.info(`Estimation selected as final: ${result.id} (module ${result.moduleId})`);
        return result;
    },

    async listReviewQueue(projectId: string): Promise<ModuleEstimation[]> {
        return estimationRepository.listReviewQueue(projectId);
    },

    /** All engineers' estimates for a module — the Lead comparison view. */
    async getComparisons(moduleId: string): Promise<ModuleEstimation[]> {
        return estimationRepository.listEstimations({ moduleId });
    },

    // ── Computed summary & workload ────────────────────

    async getProjectSummary(projectId: string): Promise<EstimationProjectSummary> {
        if (!projectId?.trim()) throw new Error('Project is required');
        return estimationRepository.getProjectSummary(projectId);
    },

    async getEngineerWorkloads(projectId: string): Promise<EngineerWorkload[]> {
        if (!projectId?.trim()) throw new Error('Project is required');
        return estimationRepository.getEngineerWorkloads(projectId);
    },

    async getCapacityReport(projectId: string): Promise<CapacityReport> {
        if (!projectId?.trim()) throw new Error('Project is required');
        return estimationRepository.getCapacityReport(projectId);
    },

    // ── History & review events ────────────────────────

    async getHistory(estimationId: string): Promise<EstimationHistoryEntry[]> {
        return estimationRepository.getHistory(estimationId);
    },

    async getReviewEvents(estimationId: string): Promise<EstimationReviewEvent[]> {
        return estimationRepository.getReviewEvents(estimationId);
    },
};

/**
 * RBAC-ready owner check. While auth is off (`actor` undefined) this is a no-op (matches the inert
 * `maybeAuthorize` gate). When an actor is present, only the owner, a QA Lead, or an Admin may modify.
 * Finer workflow rules (e.g. "no edits after submit") are enforced in Phase 2.
 */
function assertCanModify(estimation: ModuleEstimation, actor?: Actor): void {
    if (!actor?.id) return; // auth off → system
    if (actor.role === 'admin' || actor.role === 'qa_lead') return;
    if (estimation.engineerId !== actor.id) {
        throw new Error('You can only edit your own estimation');
    }
}

/** Statuses from which a Lead may approve / request revision / reject. */
const REVIEWABLE: EstimationStatus[] = ['Submitted', 'Under Review'];

/** Lead/Admin-only gate for review actions. Inert while auth is off (system principal). */
function requireLead(actor?: Actor): void {
    if (!actor?.id) return;
    if (actor.role === 'admin' || actor.role === 'qa_lead') return;
    throw new Error('Only a QA Lead or Admin can perform this review action');
}

/** Resolve an actor into the { actorId, actorName } fields stored on review events. */
function actorFields(actor?: Actor): { actorId?: string; actorName?: string } {
    return actor?.id ? { actorId: actor.id, actorName: actor.name } : {};
}

async function mustBeReviewable(id: string): Promise<ModuleEstimation> {
    const e = await estimationRepository.getEstimation(id);
    if (!e) throw new Error('Estimation not found');
    if (!REVIEWABLE.includes(e.status)) {
        throw new Error(`This action requires the estimation to be Submitted or Under Review (current: ${e.status})`);
    }
    return e;
}

async function requireResult<T>(p: Promise<T | undefined>, msg = 'Estimation not found'): Promise<T> {
    const r = await p;
    if (!r) throw new Error(msg);
    return r;
}
