/**
 * Bug Management Controller
 * HTTP handlers for bug generation, CRUD, and analytics
 */

import { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendCreated, sendValidationError, sendError, paginate } from '../../../shared/http/responses';
import bugGenerationService from '../services/bug-generation.service';
import { bugImportService } from '../services/bug-import.service';
import bugRepository from '../repositories/bug.repository';
import logger from '../../../shared/logger';
import {
    BugGenerationInput,
    SaveBugInput,
    UpdateBugInput,
    BugLayer,
    InputMethod,
    BugSeverity,
    BugPriority,
    BugStatus,
    BugImportSaveInput,
    BugImportValidationError,
    isValidStatusTransition,
    nextStatuses,
} from '../types';

// Valid values for validation
const VALID_LAYERS: BugLayer[] = ['Frontend', 'Backend', 'Integration', 'Mobile', 'Infrastructure'];
const VALID_METHODS: InputMethod[] = ['description', 'structured', 'log'];

/** Minimal shape of a multer memory-storage upload (avoids coupling to the Express.Multer namespace). */
interface UploadedFile {
    buffer: Buffer;
    originalname: string;
    size: number;
    mimetype: string;
}

export const bugManagementController = {
    /**
     * POST /api/bugs/generate
     * AI generates a professional bug report from user input
     */
    async generateBug(req: Request, res: Response) {
        try {
            const body = req.body;

            // Validate required fields
            if (!body.projectName) {
                return sendValidationError(res, { projectName: 'Project name is required' });
            }
            if (!body.layer || !VALID_LAYERS.includes(body.layer)) {
                return sendValidationError(res, { layer: 'Valid bug layer is required' });
            }

            const inputMethod = (body.inputMethod || 'description') as InputMethod;
            if (!VALID_METHODS.includes(inputMethod)) {
                return sendValidationError(res, { inputMethod: 'Invalid input method' });
            }

            // Validate input content based on method
            if (inputMethod === 'description' && !body.description?.trim()) {
                return sendValidationError(res, { description: 'Description is required' });
            }
            if (inputMethod === 'log' && !body.logs?.trim()) {
                return sendValidationError(res, { logs: 'Logs are required' });
            }

            const input: BugGenerationInput = {
                projectName: body.projectName,
                layer: body.layer,
                inputMethod,
                description: body.description,
                module: body.module,
                expectedResult: body.expectedResult,
                actualResult: body.actualResult,
                steps: body.steps,
                logs: body.logs,
            };

            logger.info('POST /api/bugs/generate', { project: input.projectName, layer: input.layer });

            const result = await bugGenerationService.generate(input);

            sendSuccess(res, result, undefined, 'Bug report generated successfully');
        } catch (error: any) {
            logger.error('Bug generation failed', { message: error.message, stack: error.stack });
            sendError(res, 500, error.message || 'Bug generation failed');
        }
    },

    /**
     * POST /api/bugs/save
     * Save a bug to the repository
     */
    async saveBug(req: Request, res: Response) {
        try {
            const body = req.body;

            if (!body.title?.trim()) {
                return sendValidationError(res, { title: 'Bug title is required' });
            }
            if (!body.projectName?.trim()) {
                return sendValidationError(res, { projectName: 'Project name is required' });
            }
            if (!body.layer || !VALID_LAYERS.includes(body.layer)) {
                return sendValidationError(res, { layer: 'Valid bug layer is required' });
            }

            const input: SaveBugInput = {
                bugId: body.bugId || bugRepository.generateBugId(),
                projectName: body.projectName,
                layer: body.layer,
                title: body.title,
                description: body.description || '',
                module: body.module || 'Unknown',
                severity: body.severity || 'Medium',
                priority: body.priority || 'P3',
                status: body.status || 'Open',
                environment: body.environment,
                precondition: body.precondition || '',
                currentBehavior: body.currentBehavior || [],
                stepsToReproduce: body.stepsToReproduce || [],
                expectedResult: body.expectedResult || '',
                actualResult: body.actualResult || '',
                impact: body.impact || '',
                reporter: req.user?.id ?? body.reporter,
                assignee: body.assignee,
                possibleRootCause: body.possibleRootCause,
                suggestedFix: body.suggestedFix,
                similarBugs: body.similarBugs,
                missingInfo: body.missingInfo,
                tags: body.tags,
                aiConfidence: body.aiConfidence,
            };

            logger.info('POST /api/bugs/save', { title: input.title, project: input.projectName });

            const bug = await bugRepository.save(input);

            sendCreated(res, bug, undefined, 'Bug report saved successfully');
        } catch (error: any) {
            logger.error('Bug save failed', { message: error.message });
            sendError(res, 500, error.message || 'Failed to save bug');
        }
    },

    /**
     * POST /api/bugs/import
     * Parse + validate an uploaded XLSX (multipart/form-data: `file` + `projectName`).
     * Returns a flat bug preview; does NOT persist. Validation/conflict failures return a structured
     * body (`errorType` + details) so the frontend can render tailored error UI.
     */
    async importBugPreview(req: Request, res: Response) {
        try {
            const file = (req as any).file as UploadedFile | undefined;
            const projectName = String(req.body?.projectName ?? req.query.project ?? '').trim();

            if (!file) {
                return sendError(res, 400, 'No file uploaded. Please attach an .xlsx file.');
            }
            if (!projectName) {
                return sendError(res, 400, 'A project must be selected before importing.');
            }

            logger.info('POST /api/bugs/import', {
                project: projectName,
                file: file.originalname,
                size: file.size,
            });

            const preview = await bugImportService.parseAndValidate(file.buffer, projectName);
            sendSuccess(
                res,
                preview,
                { totalBugs: preview.totalBugs },
                'File parsed and validated successfully',
            );
        } catch (error: any) {
            handleBugImportError(res, error);
        }
    },

    /**
     * POST /api/bugs/import/save
     * Persist a validated import preview into Bug Management. Re-checks Bug ID conflicts (stateless
     * safety) before writing each bug via the repository — the same path manual/AI bugs take.
     */
    async importBugSave(req: Request, res: Response) {
        try {
            const input = req.body as BugImportSaveInput;

            if (!input?.projectName?.trim()) {
                return sendError(res, 400, 'A project must be selected before saving.');
            }
            if (!input.bugs || !Array.isArray(input.bugs) || input.bugs.length === 0) {
                return sendError(res, 400, 'Nothing to save: no bugs in the import payload.');
            }

            logger.info('POST /api/bugs/import/save', {
                project: input.projectName,
                bugs: input.bugs.length,
            });

            const result = await bugImportService.saveImport(input);
            sendCreated(
                res,
                result.saved,
                { total: result.total },
                'Bugs imported successfully',
            );
        } catch (error: any) {
            handleBugImportError(res, error);
        }
    },

    /**
     * GET /api/bugs
     * List bugs with optional filters
     */
    async listBugs(req: Request, res: Response) {
        try {
            const filter = {
                projectName: req.query.project as string | undefined,
                layer: req.query.layer as BugLayer | undefined,
                severity: req.query.severity as BugSeverity | undefined,
                status: req.query.status as BugStatus | undefined,
                module: req.query.module as string | undefined,
                search: req.query.search as string | undefined,
            };

            const bugs = await bugRepository.getAll(filter);

            const { data, meta } = paginate(bugs, req);
            sendSuccess(res, data, meta);
        } catch (error: any) {
            sendError(res, 500, error.message);
        }
    },

    /**
     * GET /api/bugs/:id
     * Get a single bug by ID
     */
    async getBug(req: Request, res: Response) {
        try {
            const bug = await bugRepository.getById(String(req.params.id));
            if (!bug) {
                return sendError(res, 404, 'Bug not found');
            }
            sendSuccess(res, bug);
        } catch (error: any) {
            sendError(res, 500, error.message);
        }
    },

    /**
     * PATCH /api/bugs/:id
     * Update a bug with change tracking
     */
    async updateBug(req: Request, res: Response) {
        try {
            const id = String(req.params.id);
            const body = req.body;

            // Validate enum fields if provided
            if (body.severity && !['Critical', 'High', 'Medium', 'Low'].includes(body.severity)) {
                return sendValidationError(res, { severity: 'Invalid severity value' });
            }
            if (body.priority && !['P1', 'P2', 'P3', 'P4'].includes(body.priority)) {
                return sendValidationError(res, { priority: 'Invalid priority value' });
            }
            if (body.status && !['Open', 'Assigned', 'In Progress', 'Fixed', 'Ready For QA', 'Verified', 'Closed', 'Reopened'].includes(body.status)) {
                return sendValidationError(res, { status: 'Invalid status value' });
            }
            if (body.layer && !['Frontend', 'Backend', 'Integration', 'Mobile', 'Infrastructure'].includes(body.layer)) {
                return sendValidationError(res, { layer: 'Invalid layer value' });
            }

            // Resolve the current bug first — needed for field-level authorization + transition check.
            const existing = await bugRepository.getById(id);
            if (!existing) {
                return sendError(res, 404, 'Bug not found');
            }

            // ── Field-level RBAC (service-layer business authorization; UI hiding is defense-in-depth) ──
            // Inert in dev (AUTH_ENABLED=false ⇒ no req.user) so local flows stay open. See docs/rbac-design.md.
            const user = req.user;
            if (user) {
                const isLeadOrAdmin = user.role === 'admin' || user.role === 'qa_lead';
                // Severity / Priority / Assignee → QA Lead or Admin only.
                if (
                    !isLeadOrAdmin &&
                    (body.severity !== undefined || body.priority !== undefined || body.assignee !== undefined)
                ) {
                    return sendError(
                        res,
                        403,
                        'Your role can only update bug status. Severity, priority, and assignment require a QA Lead or Admin.',
                    );
                }
                // Status → engineers may update only bugs assigned to them.
                if (body.status !== undefined && !isLeadOrAdmin) {
                    if (!existing.assigneeId || existing.assigneeId !== user.id) {
                        return sendError(res, 403, 'You can only update the status of bugs assigned to you.');
                    }
                }
            }

            // ── Status workflow: reject invalid transitions (backend is the source of truth) ──
            if (body.status !== undefined && body.status !== existing.status) {
                if (!isValidStatusTransition(existing.status, body.status as BugStatus)) {
                    return res.status(400).json({
                        success: false,
                        error: `"${existing.status}" → "${body.status}" is not a valid status transition.`,
                        allowedNext: nextStatuses(existing.status),
                    });
                }
            }

            const updates: UpdateBugInput = {
                ...(body.title !== undefined && { title: body.title }),
                ...(body.severity !== undefined && { severity: body.severity }),
                ...(body.priority !== undefined && { priority: body.priority }),
                ...(body.status !== undefined && { status: body.status }),
                ...(body.layer !== undefined && { layer: body.layer }),
                ...(body.module !== undefined && { module: body.module }),
                ...(body.assignee !== undefined && { assignee: body.assignee }),
                ...(body.environment !== undefined && { environment: body.environment }),
                ...(body.description !== undefined && { description: body.description }),
                ...(body.impact !== undefined && { impact: body.impact }),
                ...(body.precondition !== undefined && { precondition: body.precondition }),
                ...(body.expectedResult !== undefined && { expectedResult: body.expectedResult }),
                ...(body.actualResult !== undefined && { actualResult: body.actualResult }),
                ...(body.currentBehavior !== undefined && { currentBehavior: body.currentBehavior }),
                ...(body.stepsToReproduce !== undefined && { stepsToReproduce: body.stepsToReproduce }),
                ...(body.possibleRootCause !== undefined && { possibleRootCause: body.possibleRootCause }),
                ...(body.suggestedFix !== undefined && { suggestedFix: body.suggestedFix }),
                ...(body.tags !== undefined && { tags: body.tags }),
                changedBy: req.user?.id ?? body.changedBy ?? 'QA Team',
            };

            const result = await bugRepository.update(id, updates);
            if (!result) {
                return sendError(res, 404, 'Bug not found');
            }

            logger.info(`PATCH /api/bugs/:id - ${result.bug.bugId} updated (v${result.bug.version}), changes: [${result.changes.join(', ')}]`);

            sendSuccess(
                res,
                result.bug,
                { changes: result.changes, version: result.bug.version },
                'Bug updated successfully'
            );
        } catch (error: any) {
            logger.error('Bug update failed', { message: error.message });
            sendError(res, 500, error.message);
        }
    },

    /**
     * GET /api/bugs/:id/history
     * Get edit history for a bug
     */
    async getBugHistory(req: Request, res: Response) {
        try {
            const id = String(req.params.id);
            const bug = await bugRepository.getById(id);
            if (!bug) {
                return sendError(res, 404, 'Bug not found');
            }
            const history = await bugRepository.getHistory(id);
            sendSuccess(res, history, { count: history.length });
        } catch (error: any) {
            sendError(res, 500, error.message);
        }
    },

    /**
     * DELETE /api/bugs/:id
     * Delete a bug
     */
    async deleteBug(req: Request, res: Response) {
        try {
            const deleted = await bugRepository.delete(String(req.params.id));
            if (!deleted) {
                return sendError(res, 404, 'Bug not found');
            }
            sendSuccess(res, {}, undefined, 'Bug deleted successfully');
        } catch (error: any) {
            sendError(res, 500, error.message);
        }
    },

    /**
     * GET /api/bugs/analytics
     * Get dashboard analytics
     */
    async getAnalytics(req: Request, res: Response) {
        try {
            const projectName = req.query.project as string | undefined;
            const analytics = await bugRepository.getAnalytics(projectName);
            sendSuccess(res, analytics);
        } catch (error: any) {
            sendError(res, 500, error.message);
        }
    },
};

/**
 * Map a bug import error to a structured HTTP response. `BugImportValidationError` carries an
 * `errorType` + details (missing columns, row errors, duplicate/existing Bug IDs) the frontend
 * renders differently; it must NOT fall through to the generic global handler (which would 500 it).
 * Bug ID conflicts are 409 (state conflict); everything else is 400.
 */
function handleBugImportError(res: Response, error: any): Response {
    if (error instanceof BugImportValidationError) {
        const conflict = error.errorType === 'BUG_ID_EXISTS' || error.errorType === 'DUPLICATE_BUG_ID';
        const status = conflict ? 409 : 400;
        return res.status(status).json({
            success: false,
            error: error.message, // apiClient normalizes on `error` || `message`
            message: error.message,
            errorType: error.errorType,
            missingColumns: error.details.missingColumns,
            rowErrors: error.details.rowErrors,
            duplicateBugIds: error.details.duplicateBugIds,
            existingBugIds: error.details.existingBugIds,
        });
    }
    logger.error('Bug import failed', { message: error?.message });
    return sendError(res, 500, error?.message || 'Failed to process import');
}
