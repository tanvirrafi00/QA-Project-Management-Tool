/**
 * Project Controller
 * HTTP handlers for project CRUD, statistics, archive and delete-guard.
 */

import { Request, Response } from 'express';
import { projectService } from '../services/project.service';
import userRepository from '../../identity/repositories/user.repository';
import logger from '../../../shared/logger';
import { sendSuccess, sendCreated, sendValidationError, sendError, paginate } from '../../../shared/http/responses';
import {
    CreateProjectInput,
    UpdateProjectInput,
    ProjectFilter,
    ProjectType,
    ProjectStatus,
} from '../types';

const VALID_TYPES: ProjectType[] = [
    'Web Application',
    'Mobile Application',
    'API',
    'Microservices',
    'Other',
];

const VALID_STATUSES: ProjectStatus[] = ['Active', 'Archived'];

export const projectController = {
    /**
     * POST /api/projects
     * Create a new project.
     */
    async createProject(req: Request, res: Response) {
        try {
            const body = req.body;

            if (!body.projectName?.trim()) {
                return sendValidationError(res, { projectName: 'Project name is required' });
            }
            if (!body.projectCode?.trim()) {
                return sendValidationError(res, { projectCode: 'Project code is required' });
            }
            if (!body.projectType || !VALID_TYPES.includes(body.projectType)) {
                return sendValidationError(res, { projectType: 'A valid project type is required' });
            }
            if (body.status && !VALID_STATUSES.includes(body.status)) {
                return sendValidationError(res, { status: 'Invalid status value' });
            }

            const input: CreateProjectInput = {
                projectName: body.projectName,
                projectCode: body.projectCode,
                description: body.description,
                projectType: body.projectType,
                status: body.status || 'Active',
                createdBy: req.user?.id ?? body.createdBy,
            };

            logger.info('POST /api/projects', { name: input.projectName, code: input.projectCode });

            const project = await projectService.create(input);
            sendCreated(res, project, undefined, 'Project created successfully');
        } catch (error: any) {
            const isConflict = /already exists/i.test(error.message);
            logger.error('Project create failed', { message: error.message });
            sendError(res, isConflict ? 409 : 500, error.message || 'Failed to create project');
        }
    },

    /**
     * GET /api/projects
     * List projects with optional filters.
     */
    async listProjects(req: Request, res: Response) {
        try {
            const filter: ProjectFilter = {
                status: req.query.status as ProjectStatus | undefined,
                projectType: req.query.type as ProjectType | undefined,
                search: req.query.search as string | undefined,
            };

            const projects = await projectService.list(filter);
            const { data, meta } = paginate(projects, req);
            sendSuccess(res, data, meta);
        } catch (error: any) {
            sendError(res, 500, error.message);
        }
    },

    /**
     * GET /api/projects/summary
     * Dashboard summary cards.
     */
    async getSummary(_req: Request, res: Response) {
        try {
            const summary = await projectService.getSummary();
            sendSuccess(res, summary);
        } catch (error: any) {
            sendError(res, 500, error.message);
        }
    },

    /**
     * GET /api/projects/active
     * Active projects for the global selector.
     */
    async listActive(_req: Request, res: Response) {
        try {
            const projects = await projectService.listActive();
            sendSuccess(res, projects);
        } catch (error: any) {
            sendError(res, 500, error.message);
        }
    },

    /**
     * GET /api/projects/:id
     * Get a single project (with statistics).
     */
    async getProject(req: Request, res: Response) {
        try {
            const project = await projectService.getById(String(req.params.id));
            if (!project) {
                return sendError(res, 404, 'Project not found');
            }
            sendSuccess(res, project);
        } catch (error: any) {
            sendError(res, 500, error.message);
        }
    },

    /**
     * PATCH /api/projects/:id
     * Update a project (code is not editable).
     */
    async updateProject(req: Request, res: Response) {
        try {
            const id = String(req.params.id);
            const body = req.body;

            if (body.projectType && !VALID_TYPES.includes(body.projectType)) {
                return sendValidationError(res, { projectType: 'Invalid project type value' });
            }
            if (body.status && !VALID_STATUSES.includes(body.status)) {
                return sendValidationError(res, { status: 'Invalid status value' });
            }

            const updates: UpdateProjectInput = {
                ...(body.projectName !== undefined && { projectName: body.projectName }),
                ...(body.description !== undefined && { description: body.description }),
                ...(body.projectType !== undefined && { projectType: body.projectType }),
                ...(body.status !== undefined && { status: body.status }),
                changedBy: req.user?.id ?? body.changedBy ?? 'QA Team',
            };

            const result = await projectService.update(id, updates);
            logger.info(`PATCH /api/projects/:id - ${result.project.projectCode} updated (v${result.project.version})`);

            sendSuccess(
                res,
                result.project,
                { changes: result.changes, version: result.project.version },
                'Project updated successfully'
            );
        } catch (error: any) {
            const isConflict = /already exists|not found/i.test(error.message);
            const status = /not found/i.test(error.message) ? 404 : isConflict ? 409 : 500;
            logger.error('Project update failed', { message: error.message });
            sendError(res, status, error.message);
        }
    },

    /**
     * PATCH /api/projects/:id/archive
     * Archive a project (soft delete).
     */
    async archiveProject(req: Request, res: Response) {
        try {
            const project = await projectService.archive(
                String(req.params.id),
                req.user?.id ?? req.body?.changedBy ?? 'QA Team'
            );
            sendSuccess(res, project, undefined, 'Project archived successfully');
        } catch (error: any) {
            const status = /not found/i.test(error.message) ? 404 : 500;
            sendError(res, status, error.message);
        }
    },

    /**
     * PATCH /api/projects/:id/restore
     * Restore an archived project.
     */
    async restoreProject(req: Request, res: Response) {
        try {
            const project = await projectService.restore(
                String(req.params.id),
                req.user?.id ?? req.body?.changedBy ?? 'QA Team'
            );
            sendSuccess(res, project, undefined, 'Project restored successfully');
        } catch (error: any) {
            const status = /not found/i.test(error.message) ? 404 : 500;
            sendError(res, status, error.message);
        }
    },

    /**
     * GET /api/projects/:id/delete-check
     * Pre-delete safety check.
     */
    async getDeleteCheck(req: Request, res: Response) {
        try {
            const check = await projectService.getDeleteCheck(String(req.params.id));
            sendSuccess(res, check);
        } catch (error: any) {
            const status = /not found/i.test(error.message) ? 404 : 500;
            sendError(res, status, error.message);
        }
    },

    /**
     * DELETE /api/projects/:id
     * Delete a project. Refuses when associated data exists unless ?force=true.
     */
    async deleteProject(req: Request, res: Response) {
        try {
            const force = req.query.force === 'true';
            const result = await projectService.delete(String(req.params.id), force);

            if (!result.deleted) {
                // Distinguish "not found" from "blocked by data"
                if (/not found/i.test(result.reason || '')) {
                    return sendError(res, 404, result.reason || 'Project not found');
                }
                return sendError(res, 409, result.reason || 'Delete blocked by associated data');
            }

            sendSuccess(res, {}, undefined, 'Project deleted successfully');
        } catch (error: any) {
            sendError(res, 500, error.message);
        }
    },

    /**
     * GET /api/projects/:id/history
     * Audit history for a project.
     */
    async getHistory(req: Request, res: Response) {
        try {
            const history = await projectService.getHistory(String(req.params.id));
            sendSuccess(res, history, { count: history.length });
        } catch (error: any) {
            sendError(res, 500, error.message);
        }
    },

    /**
     * GET /api/projects/:id/members
     * Active members of a project — feeds the inline "Assigned To" dropdown. `:id` may be the project
     * uuid, code, or name. Project isolation: non-admins may only see members of projects they belong to.
     */
    async getMembers(req: Request, res: Response) {
        try {
            const project = await projectService.getById(String(req.params.id));
            if (!project) {
                return sendError(res, 404, 'Project not found');
            }
            const caller = req.user;
            if (caller && caller.role !== 'admin') {
                const ok = await userRepository.isMemberOf(caller.id, project.id);
                if (!ok) {
                    return sendError(res, 403, 'You do not have access to this project');
                }
            }
            const members = await userRepository.listProjectMembers(project.id);
            sendSuccess(res, members, { count: members.length });
        } catch (error: any) {
            sendError(res, 500, error.message);
        }
    },
};
