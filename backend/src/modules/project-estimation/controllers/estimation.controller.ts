/**
 * Estimation Controller
 * HTTP handlers for versions, modules, assignments, estimations and the computed summary.
 * Mirrors the project-management controller's envelope usage (sendSuccess/sendCreated/sendError).
 */

import { Request, Response } from 'express';
import { estimationService, type Actor } from '../services/estimation.service';
import logger from '../../../shared/logger';
import { sendSuccess, sendCreated, sendValidationError, sendError, paginate } from '../../../shared/http/responses';
import {
    CreateVersionInput,
    CreateModuleInput,
    CreateAssignmentInput,
    CreateEstimationInput,
    UpdateEstimationInput,
    ComplexityLevel,
    RiskLevel,
} from '../types';

const VALID_COMPLEXITY: ComplexityLevel[] = ['Low', 'Medium', 'High', 'Critical'];
const VALID_RISK: RiskLevel[] = ['Low', 'Medium', 'High'];

/**
 * Map a service error message to an HTTP status (cleaner semantics, same envelope). The estimation
 * service throws plain `Error`s, so we classify by message. State-machine violations (wrong source
 * status for submit/resubmit/approve/…), "already exists", and ownership/role denials must map to
 * 409/403 — not 500 — so clients can react correctly.
 */
function statusFor(message: string): number {
    if (/not found/i.test(message)) return 404;
    // State conflicts: duplicate, or an action disallowed in the current status.
    if (/already exists|already assigned|current:|can be (submitted|resubmitted|approved|rejected|reopened|requested)|reviewable|requires the estimation/i.test(message)) {
        return 409;
    }
    // Authorization: ownership or role requirements.
    if (/only edit your own|only the estimate owner|only qa leads?|cannot/i.test(message)) return 403;
    // Bad input.
    if (/required|invalid|negative|greater than|must be|finite|not a (valid )?number/i.test(message)) return 400;
    return 500;
}

/**
 * Validate an optional numeric body field: undefined/null pass through; anything that is not a finite
 * number is rejected. Guards `estimation-math` from string values that would otherwise string-concatenate
 * (e.g. `dailyCapacityHours:"8"` producing capacity "088" instead of 8).
 */
function requireFiniteNumber(body: Record<string, unknown>, field: string, res: Response): string | null {
    const v = (body as any)[field];
    if (v === undefined || v === null) return null;
    if (typeof v !== 'number' || !Number.isFinite(v)) {
        sendValidationError(res, { [field]: `${field} must be a finite number` });
        return field;
    }
    return null;
}

function actorOf(req: Request): Actor | undefined {
    return req.user
        ? { id: (req.user as any).id, name: (req.user as any).name, role: (req.user as any).role }
        : undefined;
}

export const estimationController = {
    // ── Versions ───────────────────────────────────────

    /** POST /api/estimations/projects/:projectId/versions */
    async createVersion(req: Request, res: Response) {
        try {
            const projectId = String(req.params.projectId);
            const body = req.body || {};
            if (!body.name?.trim()) {
                return sendValidationError(res, { name: 'Version name is required' });
            }
            const input: CreateVersionInput = {
                projectId,
                name: body.name,
                code: body.code,
                status: body.status,
                targetDate: body.targetDate,
                notes: body.notes,
                createdBy: req.user?.id ?? body.createdBy,
            };
            const version = await estimationService.createVersion(input);
            sendCreated(res, version, undefined, 'Version created successfully');
        } catch (error: any) {
            logger.error('Estimation createVersion failed', { message: error.message });
            sendError(res, statusFor(error.message), error.message);
        }
    },

    /** GET /api/estimations/projects/:projectId/versions */
    async listVersions(req: Request, res: Response) {
        try {
            const versions = await estimationService.listVersions({
                projectId: String(req.params.projectId),
                status: req.query.status as any,
                search: req.query.search as string | undefined,
            });
            const { data, meta } = paginate(versions, req);
            sendSuccess(res, data, meta);
        } catch (error: any) {
            sendError(res, statusFor(error.message), error.message);
        }
    },

    // ── Modules ────────────────────────────────────────

    /** POST /api/estimations/projects/:projectId/modules  (body.versionId optional) */
    async createModule(req: Request, res: Response) {
        try {
            const body = req.body || {};
            const projectId = String(req.params.projectId || body.projectId || '');
            if (!projectId) {
                return sendValidationError(res, { projectId: 'Project is required' });
            }
            if (!body.name?.trim()) {
                return sendValidationError(res, { name: 'Module name is required' });
            }
            const versionId = body.versionId && body.versionId !== 'none' ? body.versionId : undefined;
            const input: CreateModuleInput = {
                projectId,
                versionId,
                name: body.name,
                description: body.description,
                sortOrder: body.sortOrder,
                createdBy: req.user?.id ?? body.createdBy,
            };
            const mod = await estimationService.createModule(input);
            sendCreated(res, mod, undefined, 'Module created successfully');
        } catch (error: any) {
            logger.error('Estimation createModule failed', { message: error.message });
            sendError(res, statusFor(error.message), error.message);
        }
    },

    /** GET /api/estimations/projects/:projectId/modules */
    async listModules(req: Request, res: Response) {
        try {
            const modules = await estimationService.listModules({
                projectId: String(req.params.projectId),
                versionId: req.query.versionId === 'none' ? undefined : (req.query.versionId as string | undefined),
                search: req.query.search as string | undefined,
            });
            const { data, meta } = paginate(modules, req);
            sendSuccess(res, data, meta);
        } catch (error: any) {
            sendError(res, statusFor(error.message), error.message);
        }
    },

    // ── Assignments ────────────────────────────────────

    /** POST /api/estimations/modules/:moduleId/assignments */
    async createAssignment(req: Request, res: Response) {
        try {
            const body = req.body || {};
            if (!body.engineerId?.trim()) {
                return sendValidationError(res, { engineerId: 'Engineer is required' });
            }
            if (requireFiniteNumber(body, 'dailyCapacityHours', res)) return;
            const input: CreateAssignmentInput = {
                moduleId: String(req.params.moduleId),
                engineerId: body.engineerId,
                engineerName: body.engineerName,
                projectId: body.projectId,
                dailyCapacityHours: body.dailyCapacityHours,
                role: body.role,
                createdBy: req.user?.id ?? body.createdBy,
            };
            const assignment = await estimationService.createAssignment(input);
            sendCreated(res, assignment, undefined, 'Assignment created successfully');
        } catch (error: any) {
            logger.error('Estimation createAssignment failed', { message: error.message });
            sendError(res, statusFor(error.message), error.message);
        }
    },

    /** GET /api/estimations/modules/:moduleId/assignments */
    async listAssignments(req: Request, res: Response) {
        try {
            const assignments = await estimationService.listAssignments({
                moduleId: String(req.params.moduleId),
            });
            const { data, meta } = paginate(assignments, req);
            sendSuccess(res, data, meta);
        } catch (error: any) {
            sendError(res, statusFor(error.message), error.message);
        }
    },

    // ── Estimations ────────────────────────────────────

    /** POST /api/estimations/modules/:moduleId/estimations  (body.engineerId required) */
    async createEstimation(req: Request, res: Response) {
        try {
            const body = req.body || {};
            if (!body.engineerId?.trim()) {
                return sendValidationError(res, { engineerId: 'Engineer is required' });
            }
            if (body.complexity && !VALID_COMPLEXITY.includes(body.complexity)) {
                return sendValidationError(res, { complexity: 'Invalid complexity value' });
            }
            if (body.riskLevel && !VALID_RISK.includes(body.riskLevel)) {
                return sendValidationError(res, { riskLevel: 'Invalid risk level value' });
            }
            if (requireFiniteNumber(body, 'testCaseCount', res)) return;
            if (requireFiniteNumber(body, 'estimatedHours', res)) return;
            const input: CreateEstimationInput = {
                assignmentId: body.assignmentId,
                moduleId: String(req.params.moduleId),
                engineerId: body.engineerId,
                engineerName: body.engineerName,
                projectId: body.projectId,
                testCaseCount: body.testCaseCount,
                estimatedHours: body.estimatedHours,
                complexity: body.complexity,
                riskLevel: body.riskLevel,
                assumptions: body.assumptions,
                dependencies: body.dependencies,
                notes: body.notes,
                createdBy: req.user?.id ?? body.createdBy,
            };
            const estimation = await estimationService.createEstimation(input);
            sendCreated(res, estimation, undefined, 'Estimation created successfully');
        } catch (error: any) {
            logger.error('Estimation create failed', { message: error.message });
            sendError(res, statusFor(error.message), error.message);
        }
    },

    /** GET /api/estimations/estimations/:id */
    async getEstimation(req: Request, res: Response) {
        try {
            const estimation = await estimationService.getEstimation(String(req.params.id));
            sendSuccess(res, estimation);
        } catch (error: any) {
            sendError(res, statusFor(error.message), error.message);
        }
    },

    /** PATCH /api/estimations/estimations/:id */
    async updateEstimation(req: Request, res: Response) {
        try {
            const body = req.body || {};
            if (body.complexity && !VALID_COMPLEXITY.includes(body.complexity)) {
                return sendValidationError(res, { complexity: 'Invalid complexity value' });
            }
            if (body.riskLevel && !VALID_RISK.includes(body.riskLevel)) {
                return sendValidationError(res, { riskLevel: 'Invalid risk level value' });
            }
            if (requireFiniteNumber(body, 'testCaseCount', res)) return;
            if (requireFiniteNumber(body, 'estimatedHours', res)) return;
            const updates: UpdateEstimationInput = {
                ...(body.testCaseCount !== undefined && { testCaseCount: body.testCaseCount }),
                ...(body.estimatedHours !== undefined && { estimatedHours: body.estimatedHours }),
                ...(body.complexity !== undefined && { complexity: body.complexity }),
                ...(body.riskLevel !== undefined && { riskLevel: body.riskLevel }),
                ...(body.assumptions !== undefined && { assumptions: body.assumptions }),
                ...(body.dependencies !== undefined && { dependencies: body.dependencies }),
                ...(body.notes !== undefined && { notes: body.notes }),
            };
            const result = await estimationService.updateEstimation(String(req.params.id), updates, actorOf(req));
            sendSuccess(
                res,
                result.estimation,
                { changes: result.changes, version: result.estimation.version },
                'Estimation updated successfully',
            );
        } catch (error: any) {
            logger.error('Estimation update failed', { message: error.message });
            sendError(res, statusFor(error.message), error.message);
        }
    },

    /** GET /api/estimations/projects/:projectId/estimations */
    async listEstimations(req: Request, res: Response) {
        try {
            const estimations = await estimationService.listEstimations({
                projectId: String(req.params.projectId),
                moduleId: req.query.moduleId as string | undefined,
                engineerId: req.query.engineerId as string | undefined,
                status: req.query.status as any,
                isFinalApproved:
                    req.query.isFinalApproved === 'true' ? true : req.query.isFinalApproved === 'false' ? false : undefined,
                search: req.query.search as string | undefined,
            });
            const { data, meta } = paginate(estimations, req);
            sendSuccess(res, data, meta);
        } catch (error: any) {
            sendError(res, statusFor(error.message), error.message);
        }
    },

    // ── Computed summary & workload ────────────────────

    /** GET /api/estimations/projects/:projectId/summary */
    async getSummary(req: Request, res: Response) {
        try {
            const summary = await estimationService.getProjectSummary(String(req.params.projectId));
            sendSuccess(res, summary);
        } catch (error: any) {
            sendError(res, statusFor(error.message), error.message);
        }
    },

    /** GET /api/estimations/projects/:projectId/engineers */
    async getEngineerWorkloads(req: Request, res: Response) {
        try {
            const workloads = await estimationService.getEngineerWorkloads(String(req.params.projectId));
            sendSuccess(res, workloads, { count: workloads.length });
        } catch (error: any) {
            sendError(res, statusFor(error.message), error.message);
        }
    },

    /** GET /api/estimations/projects/:projectId/capacity — capacity report for the charts */
    async getCapacity(req: Request, res: Response) {
        try {
            const report = await estimationService.getCapacityReport(String(req.params.projectId));
            sendSuccess(res, report);
        } catch (error: any) {
            sendError(res, statusFor(error.message), error.message);
        }
    },

    // ── History & review events ────────────────────────

    /** GET /api/estimations/estimations/:id/history */
    async getHistory(req: Request, res: Response) {
        try {
            const history = await estimationService.getHistory(String(req.params.id));
            sendSuccess(res, history, { count: history.length });
        } catch (error: any) {
            sendError(res, statusFor(error.message), error.message);
        }
    },

    /** GET /api/estimations/estimations/:id/review-history */
    async getReviewEvents(req: Request, res: Response) {
        try {
            const events = await estimationService.getReviewEvents(String(req.params.id));
            sendSuccess(res, events, { count: events.length });
        } catch (error: any) {
            sendError(res, statusFor(error.message), error.message);
        }
    },

    // ── Approval workflow ──────────────────────────────

    /** POST /api/estimations/estimations/:id/submit */
    async submit(req: Request, res: Response) {
        try {
            const e = await estimationService.submit(String(req.params.id), actorOf(req));
            sendSuccess(res, e, undefined, 'Estimation submitted for review');
        } catch (error: any) {
            sendError(res, statusFor(error.message), error.message);
        }
    },

    /** POST /api/estimations/estimations/:id/resubmit */
    async resubmit(req: Request, res: Response) {
        try {
            const e = await estimationService.resubmit(String(req.params.id), actorOf(req));
            sendSuccess(res, e, undefined, 'Estimation resubmitted for review');
        } catch (error: any) {
            sendError(res, statusFor(error.message), error.message);
        }
    },

    /** POST /api/estimations/estimations/:id/approve */
    async approve(req: Request, res: Response) {
        try {
            const e = await estimationService.approve(String(req.params.id), actorOf(req), req.body?.comment);
            sendSuccess(res, e, undefined, 'Estimation approved');
        } catch (error: any) {
            sendError(res, statusFor(error.message), error.message);
        }
    },

    /** POST /api/estimations/estimations/:id/request-revision */
    async requestRevision(req: Request, res: Response) {
        try {
            const e = await estimationService.requestRevision(String(req.params.id), actorOf(req), req.body?.comment);
            sendSuccess(res, e, undefined, 'Revision requested');
        } catch (error: any) {
            sendError(res, statusFor(error.message), error.message);
        }
    },

    /** POST /api/estimations/estimations/:id/reject */
    async reject(req: Request, res: Response) {
        try {
            const e = await estimationService.reject(String(req.params.id), actorOf(req), req.body?.comment);
            sendSuccess(res, e, undefined, 'Estimation rejected');
        } catch (error: any) {
            sendError(res, statusFor(error.message), error.message);
        }
    },

    /** POST /api/estimations/estimations/:id/reopen */
    async reopen(req: Request, res: Response) {
        try {
            const e = await estimationService.reopen(String(req.params.id), actorOf(req));
            sendSuccess(res, e, undefined, 'Estimation reopened for review');
        } catch (error: any) {
            sendError(res, statusFor(error.message), error.message);
        }
    },

    /** POST /api/estimations/estimations/:id/select-final */
    async selectFinal(req: Request, res: Response) {
        try {
            const e = await estimationService.selectFinal(String(req.params.id), actorOf(req));
            sendSuccess(res, e, undefined, 'Selected as the final approved estimate');
        } catch (error: any) {
            sendError(res, statusFor(error.message), error.message);
        }
    },

    /** GET /api/estimations/modules/:moduleId/comparisons */
    async getComparisons(req: Request, res: Response) {
        try {
            const estimates = await estimationService.getComparisons(String(req.params.moduleId));
            sendSuccess(res, estimates, { count: estimates.length });
        } catch (error: any) {
            sendError(res, statusFor(error.message), error.message);
        }
    },

    /** GET /api/estimations/projects/:projectId/review-queue */
    async getReviewQueue(req: Request, res: Response) {
        try {
            const queue = await estimationService.listReviewQueue(String(req.params.projectId));
            sendSuccess(res, queue, { count: queue.length });
        } catch (error: any) {
            sendError(res, statusFor(error.message), error.message);
        }
    },
};
