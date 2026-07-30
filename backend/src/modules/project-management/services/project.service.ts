/**
 * Project Service
 * Business logic, validation and orchestration for the project management module.
 * Sits between the controller and the repository.
 *
 * Methods are `async` because the repository is async (in-memory today, PostgreSQL via
 * `USE_DB_PROJECTS`). Same signatures otherwise — Migration Roadmap Step 3.1.
 */

import projectRepository from '../repositories/project.repository';
import {
    Project,
    CreateProjectInput,
    UpdateProjectInput,
    ProjectFilter,
    ProjectStatistics,
    ProjectSummary,
    ProjectWithStats,
    ProjectType,
    ProjectStatus,
    DeleteCheckResult,
    ProjectHistoryEntry,
} from '../types';
import logger from '../../../shared/logger';

const VALID_TYPES: ProjectType[] = [
    'Web Application',
    'Mobile Application',
    'API',
    'Microservices',
    'Other',
];

const VALID_STATUSES: ProjectStatus[] = ['Active', 'Archived'];

export const projectService = {
    /**
     * Create a new project after validation.
     */
    async create(input: CreateProjectInput): Promise<Project> {
        if (!input.projectName?.trim()) throw new Error('Project name is required');
        if (!input.projectCode?.trim()) throw new Error('Project code is required');
        if (!input.projectType || !VALID_TYPES.includes(input.projectType)) {
            throw new Error('A valid project type is required');
        }
        if (input.status && !VALID_STATUSES.includes(input.status)) {
            throw new Error('Invalid status value');
        }

        return projectRepository.create(input);
    },

    /**
     * Get a single project (with live statistics).
     */
    async getById(idOrCodeOrName: string): Promise<ProjectWithStats | undefined> {
        return projectRepository.getWithStats(idOrCodeOrName);
    },

    /**
     * List projects with optional filtering.
     */
    async list(filter?: ProjectFilter): Promise<ProjectWithStats[]> {
        return projectRepository.getAllWithStats(filter);
    },

    /**
     * Get active projects for the global selector.
     */
    async listActive(): Promise<Project[]> {
        return projectRepository.getActive();
    },

    /**
     * Dashboard summary cards.
     */
    async getSummary(): Promise<ProjectSummary> {
        return projectRepository.getSummary();
    },

    /**
     * Update a project. Project code is never editable.
     */
    async update(idOrCodeOrName: string, updates: UpdateProjectInput): Promise<{ project: Project; changes: string[] }> {
        if (updates.projectType && !VALID_TYPES.includes(updates.projectType)) {
            throw new Error('Invalid project type value');
        }
        if (updates.status && !VALID_STATUSES.includes(updates.status)) {
            throw new Error('Invalid status value');
        }

        const result = await projectRepository.update(idOrCodeOrName, updates);
        if (!result) throw new Error('Project not found');
        return result;
    },

    /**
     * Archive a project (soft delete / read-only).
     */
    async archive(idOrCodeOrName: string, changedBy?: string): Promise<Project> {
        const project = await projectRepository.archive(idOrCodeOrName, changedBy);
        if (!project) throw new Error('Project not found');
        logger.info(`Project archived: ${project.projectCode}`);
        return project;
    },

    /**
     * Restore an archived project.
     */
    async restore(idOrCodeOrName: string, changedBy?: string): Promise<Project> {
        const project = await projectRepository.restore(idOrCodeOrName, changedBy);
        if (!project) throw new Error('Project not found');
        logger.info(`Project restored: ${project.projectCode}`);
        return project;
    },

    /**
     * Pre-delete safety check.
     */
    async getDeleteCheck(idOrCodeOrName: string): Promise<DeleteCheckResult> {
        const check = await projectRepository.getDeleteCheck(idOrCodeOrName);
        if (!check) throw new Error('Project not found');
        return check;
    },

    /**
     * Hard delete — refuses unless the project has no associated data (or force=true).
     */
    async delete(idOrCodeOrName: string, force = false): Promise<{ deleted: boolean; reason?: string }> {
        const result = await projectRepository.delete(idOrCodeOrName, force);
        if (!result.deleted && !result.reason) {
            return { deleted: false, reason: 'Project not found' };
        }
        return result;
    },

    /**
     * Live statistics for a project.
     */
    async getStatistics(projectName: string): Promise<ProjectStatistics> {
        return projectRepository.getStatistics(projectName);
    },

    /**
     * Audit history for a project.
     */
    async getHistory(idOrCodeOrName: string): Promise<ProjectHistoryEntry[]> {
        return projectRepository.getHistory(idOrCodeOrName);
    },
};
