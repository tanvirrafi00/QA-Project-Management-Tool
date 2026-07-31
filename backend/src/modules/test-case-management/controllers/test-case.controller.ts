/**
 * Test Case Management Controller
 * HTTP handlers for test case CRUD, bulk operations, analytics, module tree, and XLSX import
 */

import { Request, Response } from 'express';
import testCaseRepository from '../repositories/test-case.repository';
import { testCaseImportService } from '../services/test-case-import.service';
import logger from '../../../shared/logger';
import { sendSuccess, sendCreated, sendValidationError, sendError, paginate } from '../../../shared/http/responses';
import {
    SaveTestCaseInput, UpdateTestCaseInput, BulkSaveTestCaseInput, BulkUpdateInput,
    TestCaseFilter, TestCasePriority, TestCaseStatus, TestCaseType,
    ImportSaveInput, ImportValidationError,
    TestCasePasteSaveInput, TestCasePasteSaveResult, TestCasePasteValidationError,
} from '../types';
import { testCasePasteService } from '../services/test-case-paste.service';

/** Minimal shape of a multer memory-storage upload (avoids coupling to the Express.Multer namespace). */
interface UploadedFile {
    buffer: Buffer;
    originalname: string;
    size: number;
    mimetype: string;
}

const VALID_PRIORITIES: TestCasePriority[] = ['Critical', 'High', 'Medium', 'Low'];
const VALID_STATUSES: TestCaseStatus[] = ['Not Executed', 'Passed', 'Failed', 'Blocked', 'Skipped'];
const VALID_TYPES: TestCaseType[] = ['functional', 'negative', 'edge', 'security', 'boundary', 'scenario'];

export const testCaseController = {
    /**
     * POST /api/test-cases/save
     * Save a single test case to the repository
     */
    async saveTestCase(req: Request, res: Response) {
        try {
            const body = req.body;

            if (!body.name?.trim()) {
                return sendValidationError(res, { name: 'Test case name is required' });
            }
            if (!body.projectName?.trim()) {
                return sendValidationError(res, { projectName: 'Project name is required' });
            }
            if (!body.module?.trim()) {
                return sendValidationError(res, { module: 'Module is required' });
            }

            const input: SaveTestCaseInput = {
                projectName: body.projectName,
                module: body.module,
                subModule: body.subModule,
                name: body.name,
                description: body.description || '',
                type: body.type || 'functional',
                priority: body.priority || 'Medium',
                testSteps: body.testSteps || [],
                expectedResult: body.expectedResult || '',
                testStatus: body.testStatus,
                actualResult: body.actualResult,
                assignedTo: body.assignedTo,
                executionDate: body.executionDate,
                comments: body.comments,
                relatedBugs: body.relatedBugs,
                tags: body.tags,
            };

            logger.info('POST /api/test-cases/save', { name: input.name, project: input.projectName });

            const testCase = await testCaseRepository.save(input);
            sendCreated(res, testCase, undefined, 'Test case saved successfully');
        } catch (error: any) {
            logger.error('Test case save failed', { message: error.message });
            sendError(res, 500, error.message || 'Failed to save test case');
        }
    },

    /**
     * POST /api/test-cases/bulk-save
     * Bulk save test cases from the generator
     */
    async bulkSaveTestCases(req: Request, res: Response) {
        try {
            const body = req.body as BulkSaveTestCaseInput;

            if (!body.projectName?.trim()) {
                return sendValidationError(res, { projectName: 'Project name is required' });
            }
            if (!body.testCases || !Array.isArray(body.testCases) || body.testCases.length === 0) {
                return sendValidationError(res, { testCases: 'Test cases array is required' });
            }

            logger.info('POST /api/test-cases/bulk-save', { project: body.projectName, count: body.testCases.length });

            const result = await testCaseRepository.bulkSave(body);
            sendCreated(
                res,
                result.saved,
                { count: result.saved.length, duplicatesSkipped: result.duplicatesSkipped, total: result.total },
                'Test cases bulk saved successfully'
            );
        } catch (error: any) {
            logger.error('Bulk save failed', { message: error.message });
            sendError(res, 500, error.message || 'Failed to bulk save test cases');
        }
    },

    /**
     * GET /api/test-cases
     * List test cases with optional filters
     */
    async listTestCases(req: Request, res: Response) {
        try {
            const filter: TestCaseFilter = {
                projectName: req.query.project as string | undefined,
                module: req.query.module as string | undefined,
                subModule: req.query.subModule as string | undefined,
                priority: req.query.priority as TestCasePriority | undefined,
                testStatus: req.query.status as TestCaseStatus | undefined,
                type: req.query.type as TestCaseType | undefined,
                assignedTo: req.query.assignedTo as string | undefined,
                search: req.query.search as string | undefined,
            };

            const testCases = await testCaseRepository.getAll(filter);
            const { data, meta } = paginate(testCases, req);
            sendSuccess(res, data, meta);
        } catch (error: any) {
            sendError(res, 500, error.message);
        }
    },

    /**
     * GET /api/test-cases/:id
     * Get a single test case by ID
     */
    async getTestCase(req: Request, res: Response) {
        try {
            const testCase = await testCaseRepository.getById(String(req.params.id));
            if (!testCase) {
                return sendError(res, 404, 'Test case not found');
            }
            sendSuccess(res, testCase);
        } catch (error: any) {
            sendError(res, 500, error.message);
        }
    },

    /**
     * PATCH /api/test-cases/:id
     * Update a test case with change tracking
     */
    async updateTestCase(req: Request, res: Response) {
        try {
            const id = String(req.params.id);
            const body = req.body;

            // Validate enum fields if provided
            if (body.priority && !VALID_PRIORITIES.includes(body.priority)) {
                return sendValidationError(res, { priority: 'Invalid priority value' });
            }
            if (body.testStatus && !VALID_STATUSES.includes(body.testStatus)) {
                return sendValidationError(res, { testStatus: 'Invalid status value' });
            }
            if (body.type && !VALID_TYPES.includes(body.type)) {
                return sendValidationError(res, { type: 'Invalid type value' });
            }

            // ── Field-level RBAC (service-layer business authorization; UI hiding is defense-in-depth) ──
            // Inert in dev (AUTH_ENABLED=false ⇒ no req.user). Execution status (testStatus) is editable by
            // all roles — engineers execute; classification (priority) and assignment require Lead/Admin.
            const user = req.user;
            if (user) {
                const isLeadOrAdmin = user.role === 'admin' || user.role === 'qa_lead';
                if (!isLeadOrAdmin && (body.priority !== undefined || body.assignedTo !== undefined)) {
                    return sendError(
                        res,
                        403,
                        'Your role can only update execution status. Priority and assignment require a QA Lead or Admin.',
                    );
                }
            }

            const updates: UpdateTestCaseInput = {
                ...(body.module !== undefined && { module: body.module }),
                ...(body.subModule !== undefined && { subModule: body.subModule }),
                ...(body.name !== undefined && { name: body.name }),
                ...(body.description !== undefined && { description: body.description }),
                ...(body.priority !== undefined && { priority: body.priority }),
                ...(body.testStatus !== undefined && { testStatus: body.testStatus }),
                ...(body.actualResult !== undefined && { actualResult: body.actualResult }),
                ...(body.assignedTo !== undefined && { assignedTo: body.assignedTo }),
                ...(body.executionDate !== undefined && { executionDate: body.executionDate }),
                ...(body.comments !== undefined && { comments: body.comments }),
                ...(body.relatedBugs !== undefined && { relatedBugs: body.relatedBugs }),
                ...(body.tags !== undefined && { tags: body.tags }),
                changedBy: req.user?.id ?? body.changedBy ?? 'QA Team',
            };

            const result = await testCaseRepository.update(id, updates);
            if (!result) {
                return sendError(res, 404, 'Test case not found');
            }

            logger.info(`PATCH /api/test-cases/:id - ${result.testCase.tcId} updated (v${result.testCase.version}), changes: [${result.changes.join(', ')}]`);

            sendSuccess(
                res,
                result.testCase,
                { changes: result.changes, version: result.testCase.version },
                'Test case updated successfully'
            );
        } catch (error: any) {
            logger.error('Test case update failed', { message: error.message });
            sendError(res, 500, error.message);
        }
    },

    /**
     * PATCH /api/test-cases/bulk-update
     * Bulk update test cases (status, assignee)
     */
    async bulkUpdateTestCases(req: Request, res: Response) {
        try {
            const body = req.body as BulkUpdateInput;

            if (!body.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
                return sendValidationError(res, { ids: 'Test case IDs array is required' });
            }
            if (body.testStatus && !VALID_STATUSES.includes(body.testStatus)) {
                return sendValidationError(res, { testStatus: 'Invalid status value' });
            }

            const result = await testCaseRepository.bulkUpdate(body);
            sendSuccess(
                res,
                result.testCases,
                { updated: result.updated },
                'Test cases bulk updated successfully'
            );
        } catch (error: any) {
            sendError(res, 500, error.message);
        }
    },

    /**
     * GET /api/test-cases/:id/history
     * Get edit history for a test case
     */
    async getTestCaseHistory(req: Request, res: Response) {
        try {
            const id = String(req.params.id);
            const testCase = await testCaseRepository.getById(id);
            if (!testCase) {
                return sendError(res, 404, 'Test case not found');
            }
            const history = await testCaseRepository.getHistory(id);
            sendSuccess(res, history, { count: history.length });
        } catch (error: any) {
            sendError(res, 500, error.message);
        }
    },

    /**
     * DELETE /api/test-cases/:id
     * Delete a test case
     */
    async deleteTestCase(req: Request, res: Response) {
        try {
            const deleted = await testCaseRepository.delete(String(req.params.id));
            if (!deleted) {
                return sendError(res, 404, 'Test case not found');
            }
            sendSuccess(res, {}, undefined, 'Test case deleted successfully');
        } catch (error: any) {
            sendError(res, 500, error.message);
        }
    },

    /**
     * DELETE /api/test-cases/modules?project=<name>&module=<name>
     * Soft-delete every test case in a module for a project (the "delete whole module" action).
     */
    async deleteModule(req: Request, res: Response) {
        try {
            const projectName = String(req.query.project ?? '').trim();
            const module = String(req.query.module ?? '').trim();

            if (!projectName) {
                return sendValidationError(res, { project: 'Project name is required' });
            }
            if (!module) {
                return sendValidationError(res, { module: 'Module name is required' });
            }

            logger.info(`DELETE /api/test-cases/modules`, { project: projectName, module });

            const deleted = await testCaseRepository.deleteByModule(projectName, module);
            if (deleted === 0) {
                return sendError(res, 404, `No test cases found for module "${module}" in project "${projectName}".`);
            }
            sendSuccess(
                res,
                { deleted, module, projectName },
                { deleted },
                `Deleted ${deleted} test case(s) from module "${module}".`,
            );
        } catch (error: any) {
            logger.error('Delete module failed', { message: error.message });
            sendError(res, 500, error.message);
        }
    },

    /**
     * GET /api/test-cases/analytics
     * Get dashboard analytics
     */
    async getAnalytics(req: Request, res: Response) {
        try {
            const projectName = req.query.project as string | undefined;
            const analytics = await testCaseRepository.getAnalytics(projectName);
            sendSuccess(res, analytics);
        } catch (error: any) {
            sendError(res, 500, error.message);
        }
    },

    /**
     * GET /api/test-cases/modules
     * Get module tree (module -> sub-modules with counts)
     */
    async getModuleTree(req: Request, res: Response) {
        try {
            const projectName = req.query.project as string | undefined;
            const tree = await testCaseRepository.getModuleTree(projectName);
            sendSuccess(res, tree);
        } catch (error: any) {
            sendError(res, 500, error.message);
        }
    },

    /**
     * POST /api/test-cases/import
     * Parse + validate an uploaded XLSX (multipart/form-data: `file` + `projectName`).
     * Returns a module-wise preview; does NOT persist. Validation/conflict failures return a
     * structured body (`errorType` + details) so the frontend can render tailored error UI.
     */
    async importTestCasePreview(req: Request, res: Response) {
        try {
            const file = (req as any).file as UploadedFile | undefined;
            const projectName = String(req.body?.projectName ?? req.query.project ?? '').trim();

            if (!file) {
                return sendError(res, 400, 'No file uploaded. Please attach an .xlsx file.');
            }
            if (!projectName) {
                return sendError(res, 400, 'A project must be selected before importing.');
            }

            logger.info('POST /api/test-cases/import', {
                project: projectName,
                file: file.originalname,
                size: file.size,
            });

            const preview = await testCaseImportService.parseAndValidate(file.buffer, projectName);
            sendSuccess(
                res,
                preview,
                { modulesCount: preview.modulesCount, totalCases: preview.totalCases },
                'File parsed and validated successfully',
            );
        } catch (error: any) {
            handleImportError(res, error);
        }
    },

    /**
     * POST /api/test-cases/import/save
     * Persist a validated import preview into Test Case Management. Re-checks module conflicts
     * (stateless safety) before writing via the repository.
     */
    async importTestCaseSave(req: Request, res: Response) {
        try {
            const input = req.body as ImportSaveInput;

            if (!input?.projectName?.trim()) {
                return sendError(res, 400, 'A project must be selected before saving.');
            }
            if (!input.modules || !Array.isArray(input.modules) || input.modules.length === 0) {
                return sendError(res, 400, 'Nothing to save: no modules in the import payload.');
            }

            logger.info('POST /api/test-cases/import/save', {
                project: input.projectName,
                modules: input.modules.length,
            });

            const result = await testCaseImportService.saveImport(input);
            sendCreated(
                res,
                result.saved,
                { total: result.total, modulesCreated: result.modulesCreated },
                'Test cases imported successfully',
            );
        } catch (error: any) {
            handleImportError(res, error);
        }
    },

    /**
     * POST /api/test-cases/paste
     * Parse + validate pasted table data (Markdown, TSV, Excel, Google Sheets).
     * Returns a module-wise preview; does NOT persist. Validation/conflict failures return a
     * structured body (`errorType` + details) so the frontend can render tailored error UI.
     */
    async parsePaste(req: Request, res: Response) {
        try {
            const text = String(req.body?.text ?? '').trim();
            const projectName = String(req.body?.projectName ?? '').trim();

            if (!text) {
                return sendError(res, 400, 'Please paste some data.');
            }
            if (!projectName) {
                return sendError(res, 400, 'A project must be selected before pasting.');
            }

            logger.info('POST /api/test-cases/paste', { project: projectName });

            const preview = await testCasePasteService.parseAndValidate(text, projectName);
            sendSuccess(
                res,
                preview,
                { modulesCount: preview.modulesCount, totalCases: preview.totalCases },
                'Paste parsed and validated successfully',
            );
        } catch (error: any) {
            handlePasteError(res, error);
        }
    },

    /**
     * POST /api/test-cases/paste/save
     * Persist a validated paste preview into Test Case Management. Re-checks module conflicts
     * (stateless safety) before writing via the repository.
     */
    async savePaste(req: Request, res: Response) {
        try {
            const input = req.body as TestCasePasteSaveInput;

            if (!input?.projectName?.trim()) {
                return sendError(res, 400, 'A project must be selected before saving.');
            }
            if (!input.modules || !Array.isArray(input.modules) || input.modules.length === 0) {
                return sendError(res, 400, 'Nothing to save: no modules in the paste payload.');
            }

            logger.info('POST /api/test-cases/paste/save', {
                project: input.projectName,
                modules: input.modules.length,
            });

            const result = await testCasePasteService.savePaste(input);
            sendCreated(
                res,
                result.saved,
                { total: result.total, modulesCreated: result.modulesCreated },
                'Test cases pasted successfully',
            );
        } catch (error: any) {
            handlePasteError(res, error);
        }
    },

    /**
     * POST /api/test-cases/quick-add
     * Quick add a single test case (no import, no AI generation)
     */
    async quickAddTestCase(req: Request, res: Response) {
        try {
            const body = req.body;

            // Validate required fields
            if (!body.projectName?.trim()) {
                return sendValidationError(res, { projectName: 'Project name is required' });
            }
            if (!body.module?.trim()) {
                return sendValidationError(res, { module: 'Module is required' });
            }
            if (!body.name?.trim()) {
                return sendValidationError(res, { name: 'Test case name is required' });
            }
            if (!body.priority) {
                return sendValidationError(res, { priority: 'Priority is required' });
            }
            if (!body.testSteps || !Array.isArray(body.testSteps) || body.testSteps.length === 0) {
                return sendValidationError(res, { testSteps: 'Test steps are required' });
            }
            if (!body.expectedResult?.trim()) {
                return sendValidationError(res, { expectedResult: 'Expected result is required' });
            }

            const input = {
                projectName: body.projectName,
                module: body.module,
                subModule: body.subModule,
                tcId: body.tcId,
                name: body.name,
                description: body.description,
                type: body.type,
                priority: body.priority as any,
                testSteps: body.testSteps,
                expectedResult: body.expectedResult,
                testStatus: body.testStatus,
                actualResult: body.actualResult,
                assignedTo: body.assignedTo,
                executionDate: body.executionDate,
                comments: body.comments,
                relatedBugs: body.relatedBugs,
                tags: body.tags,
            };

            logger.info('POST /api/test-cases/quick-add', { project: input.projectName, name: input.name });

            const testCase = await testCaseRepository.save(input);
            sendCreated(res, testCase, undefined, 'Test case added successfully');
        } catch (error: any) {
            logger.error('Quick add test case failed', { message: error.message });
            sendError(res, 400, error.message || 'Failed to add test case');
        }
    },
};

/**
 * Map an import error to a structured HTTP response. `ImportValidationError` carries an
 * `errorType` + details (conflicting modules, missing columns, …) the frontend renders
 * differently; it must NOT fall through to the generic global handler (which would 500 it).
 */
function handleImportError(res: Response, error: any): Response {
    if (error instanceof ImportValidationError) {
        const conflict =
            error.errorType === 'MODULE_EXISTS' || error.errorType === 'DUPLICATE_MODULE';
        const status = conflict ? 409 : 400;
        return res.status(status).json({
            success: false,
            error: error.message, // apiClient normalizes on `error` || `message`
            message: error.message,
            errorType: error.errorType,
            conflictingModules: error.details.conflictingModules,
            missingColumns: error.details.missingColumns,
            emptySheets: error.details.emptySheets,
            duplicateModules: error.details.duplicateModules,
            rowErrors: error.details.rowErrors,
        });
    }
    logger.error('Test case import failed', { message: error?.message });
    return sendError(res, 500, error?.message || 'Failed to process import');
}

/**
 * Map a test case paste error to a structured HTTP response. `TestCasePasteValidationError` carries an
 * `errorType` + details (conflicting modules, missing columns, row errors) the frontend renders
 * differently; it must NOT fall through to the generic global handler (which would 500 it).
 * Module conflicts are 409 (state conflict); everything else is 400.
 */
function handlePasteError(res: Response, error: any): Response {
    if (error instanceof TestCasePasteValidationError) {
        const conflict = error.errorType === 'MODULE_EXISTS';
        const status = conflict ? 409 : 400;
        return res.status(status).json({
            success: false,
            error: error.message,
            message: error.message,
            errorType: error.errorType,
            conflictingModules: error.details.conflictingModules,
            missingColumns: error.details.missingColumns,
            rowErrors: error.details.rowErrors,
        });
    }
    logger.error('Test case paste failed', { message: error?.message });
    return sendError(res, 500, error?.message || 'Failed to process paste');
}

