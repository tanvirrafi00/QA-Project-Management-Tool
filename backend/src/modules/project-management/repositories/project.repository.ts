/**
 * Project Repository — in-memory implementation (async interface) + persistence selector.
 *
 * Public methods are `async` so this repo shares an identical interface with the SQL implementation
 * (`project.repository.sql.ts`). The exported default is selected by `USE_DB_PROJECTS`:
 *   - `USE_DB_PROJECTS=false` (default) → this in-memory repo (volatile; current app behavior).
 *   - `USE_DB_PROJECTS=true`           → the Drizzle/PostgreSQL repo.
 * The service/controller `await` the repository either way.
 *
 * Migration Roadmap Step 3.1.
 */

import {
    Project,
    CreateProjectInput,
    UpdateProjectInput,
    ProjectFilter,
    ProjectStatistics,
    ProjectSummary,
    DeleteCheckResult,
    ProjectHistoryEntry,
    ProjectStatus,
    ProjectType,
    ProjectWithStats,
} from '../types';
import bugRepository from '../../bug-management/repositories/bug.repository';
import testCaseRepository from '../../test-case-management/repositories/test-case.repository';
import logger from '../../../shared/logger';
import sqlProjectRepository from './project.repository.sql';

class ProjectRepository {
    private projects: Map<string, Project> = new Map();
    private history: Map<string, ProjectHistoryEntry[]> = new Map();

    /**
     * Generate a unique internal id
     */
    private generateId(): string {
        return `proj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }

    /**
     * Normalize a project code to uppercase alphanumeric (no spaces).
     */
    normalizeCode(code: string): string {
        return code.trim().toUpperCase().replace(/\s+/g, '-').replace(/[^A-Z0-9-]/g, '');
    }

    /**
     * Check uniqueness of name & code (case-insensitive), optionally excluding one project.
     */
    isUnique(name: string, code: string, excludeId?: string): { nameTaken: boolean; codeTaken: boolean } {
        const n = name.trim().toLowerCase();
        const c = this.normalizeCode(code);
        let nameTaken = false;
        let codeTaken = false;

        for (const [id, project] of this.projects) {
            if (excludeId && id === excludeId) continue;
            if (project.projectName.trim().toLowerCase() === n) nameTaken = true;
            if (project.projectCode === c) codeTaken = true;
        }
        return { nameTaken, codeTaken };
    }

    /**
     * Create a new project.
     * Throws if name or code is not unique.
     */
    async create(input: CreateProjectInput): Promise<Project> {
        const name = input.projectName.trim();
        const code = this.normalizeCode(input.projectCode);

        if (!name) throw new Error('Project name is required');
        if (!code) throw new Error('Project code is required');

        const { nameTaken, codeTaken } = this.isUnique(name, code);
        if (nameTaken) throw new Error(`A project with the name "${name}" already exists`);
        if (codeTaken) throw new Error(`A project with the code "${code}" already exists`);

        const now = new Date().toISOString();
        const id = this.generateId();

        const project: Project = {
            id,
            projectCode: code,
            projectName: name,
            description: input.description?.trim() || '',
            projectType: input.projectType,
            status: input.status || 'Active',
            createdBy: input.createdBy || 'QA Team',
            createdAt: now,
            updatedAt: now,
            version: 1,
        };

        this.projects.set(id, project);
        logger.info(`Project created: ${project.projectCode} (${project.projectName})`);
        return project;
    }

    /**
     * Resolve any identifier (internal id, projectCode, or projectName) to the Map key.
     */
    private resolveKey(idOrCodeOrName: string): string | undefined {
        if (this.projects.has(idOrCodeOrName)) return idOrCodeOrName;

        const needle = idOrCodeOrName.trim().toLowerCase();
        for (const [key, project] of this.projects) {
            if (project.projectCode.toLowerCase() === needle) return key;
            if (project.projectName.trim().toLowerCase() === needle) return key;
        }
        return undefined;
    }

    /**
     * Get a single project by id / code / name.
     */
    async getById(idOrCodeOrName: string): Promise<Project | undefined> {
        const key = this.resolveKey(idOrCodeOrName);
        if (!key) return undefined;
        return this.projects.get(key);
    }

    /**
     * Get a single project enriched with live statistics.
     */
    async getWithStats(idOrCodeOrName: string): Promise<ProjectWithStats | undefined> {
        const project = await this.getById(idOrCodeOrName);
        if (!project) return undefined;
        return { ...project, statistics: await this.getStatistics(project.projectName) };
    }

    /**
     * List projects with optional filtering, newest first.
     */
    async getAll(filter?: ProjectFilter): Promise<Project[]> {
        let results = Array.from(this.projects.values());

        if (filter?.status) {
            results = results.filter(p => p.status === filter.status);
        }
        if (filter?.projectType) {
            results = results.filter(p => p.projectType === filter.projectType);
        }
        if (filter?.search) {
            const q = filter.search.toLowerCase();
            results = results.filter(
                p =>
                    p.projectName.toLowerCase().includes(q) ||
                    p.projectCode.toLowerCase().includes(q) ||
                    p.description.toLowerCase().includes(q)
            );
        }

        return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }

    /**
     * List projects enriched with statistics.
     */
    async getAllWithStats(filter?: ProjectFilter): Promise<ProjectWithStats[]> {
        const all = await this.getAll(filter);
        const withStats: ProjectWithStats[] = [];
        for (const p of all) {
            withStats.push({ ...p, statistics: await this.getStatistics(p.projectName) });
        }
        return withStats;
    }

    /**
     * Get only active projects — used by the global project selector.
     */
    async getActive(): Promise<Project[]> {
        return this.getAll({ status: 'Active' });
    }

    /**
     * Update a project with change tracking. Project code is NOT editable.
     */
    async update(idOrCodeOrName: string, updates: UpdateProjectInput): Promise<{ project: Project; changes: string[] } | undefined> {
        const key = this.resolveKey(idOrCodeOrName);
        if (!key) return undefined;
        const existing = this.projects.get(key);
        if (!existing) return undefined;

        const changedBy = updates.changedBy || 'QA Team';
        const now = new Date().toISOString();
        const changes: string[] = [];
        const historyEntries: ProjectHistoryEntry[] = [];

        const editableFields: (keyof UpdateProjectInput)[] = [
            'projectName', 'description', 'projectType', 'status',
        ];

        for (const field of editableFields) {
            const newValue = updates[field];
            if (newValue === undefined) continue;

            const oldValue = String((existing as any)[field]);
            const newStr = String(newValue);

            if (oldValue !== newStr) {
                changes.push(field);
                historyEntries.push({
                    id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                    projectId: existing.id,
                    changedField: field,
                    oldValue,
                    newValue: newStr,
                    changedBy,
                    changedAt: now,
                });
            }
        }

        // Uniqueness check when renaming
        if (updates.projectName !== undefined && updates.projectName.trim() !== existing.projectName.trim()) {
            const { nameTaken } = this.isUnique(updates.projectName, existing.projectCode, key);
            if (nameTaken) throw new Error(`A project with the name "${updates.projectName}" already exists`);
        }

        if (changes.length === 0) {
            return { project: existing, changes: [] };
        }

        const updated: Project = {
            ...existing,
            ...(updates.projectName !== undefined && { projectName: updates.projectName.trim() }),
            ...(updates.description !== undefined && { description: updates.description.trim() }),
            ...(updates.projectType !== undefined && { projectType: updates.projectType }),
            ...(updates.status !== undefined && { status: updates.status }),
            id: existing.id,
            projectCode: existing.projectCode, // never editable
            updatedAt: now,
            version: existing.version + 1,
        };

        this.projects.set(key, updated);

        const existingHistory = this.history.get(key) || [];
        this.history.set(key, [...existingHistory, ...historyEntries]);

        logger.info(`Project updated: ${updated.projectCode} (v${updated.version}), changed: [${changes.join(', ')}]`);
        return { project: updated, changes };
    }

    /**
     * Archive a project (soft delete). Archived projects are read-only.
     */
    async archive(idOrCodeOrName: string, changedBy?: string): Promise<Project | undefined> {
        const result = await this.update(idOrCodeOrName, { status: 'Archived', changedBy });
        return result?.project;
    }

    /**
     * Restore an archived project.
     */
    async restore(idOrCodeOrName: string, changedBy?: string): Promise<Project | undefined> {
        const result = await this.update(idOrCodeOrName, { status: 'Active', changedBy });
        return result?.project;
    }

    /**
     * Check whether a project can be safely hard-deleted (no associated data).
     */
    async getDeleteCheck(idOrCodeOrName: string): Promise<DeleteCheckResult | undefined> {
        const project = await this.getById(idOrCodeOrName);
        if (!project) return undefined;

        const bugCount = (await bugRepository.getAll({ projectName: project.projectName })).length;
        const testCaseCount = (await testCaseRepository.getAll({ projectName: project.projectName })).length;
        const reportCount = 0; // reserved for future reports module

        const warnings: string[] = [];
        if (bugCount > 0) warnings.push(`${bugCount} bug(s) are associated with this project`);
        if (testCaseCount > 0) warnings.push(`${testCaseCount} test case(s) are associated with this project`);

        return {
            canDelete: bugCount === 0 && testCaseCount === 0 && reportCount === 0,
            bugCount,
            testCaseCount,
            reportCount,
            warnings,
        };
    }

    /**
     * Hard delete a project. Refuses if associated data exists — archive instead.
     */
    async delete(idOrCodeOrName: string, force = false): Promise<{ deleted: boolean; reason?: string }> {
        const key = this.resolveKey(idOrCodeOrName);
        if (!key) return { deleted: false, reason: 'Project not found' };

        if (!force) {
            const check = await this.getDeleteCheck(key);
            if (check && !check.canDelete) {
                return {
                    deleted: false,
                    reason: `Cannot delete: ${check.warnings.join('; ')}. Archive the project instead.`,
                };
            }
        }

        const project = this.projects.get(key);
        this.projects.delete(key);
        this.history.delete(key);
        if (project) logger.info(`Project deleted: ${project.projectCode} (${project.projectName})`);
        return { deleted: true };
    }

    /**
     * Compute live statistics for a project from the bug & test-case repositories.
     */
    async getStatistics(projectName: string): Promise<ProjectStatistics> {
        const bugs = await bugRepository.getAll({ projectName });
        const testCases = await testCaseRepository.getAll({ projectName });

        const openStatuses = ['Open', 'Assigned', 'In Progress', 'Reopened'];
        const openBugs = bugs.filter(b => openStatuses.includes(b.status)).length;
        const criticalBugs = bugs.filter(b => b.severity === 'Critical').length;

        return {
            totalBugs: bugs.length,
            openBugs,
            criticalBugs,
            totalTestCases: testCases.length,
            generatedTestCases: testCases.length,
        };
    }

    /**
     * Dashboard summary cards.
     */
    async getSummary(): Promise<ProjectSummary> {
        const all = await this.getAll();
        const active = all.filter(p => p.status === 'Active').length;
        const archived = all.filter(p => p.status === 'Archived').length;

        let totalBugs = 0;
        let totalTestCases = 0;
        for (const project of all) {
            const stats = await this.getStatistics(project.projectName);
            totalBugs += stats.totalBugs;
            totalTestCases += stats.totalTestCases;
        }

        return {
            totalProjects: all.length,
            activeProjects: active,
            archivedProjects: archived,
            totalBugs,
            totalTestCases,
        };
    }

    /**
     * Get edit history for a project.
     */
    async getHistory(idOrCodeOrName: string): Promise<ProjectHistoryEntry[]> {
        const key = this.resolveKey(idOrCodeOrName);
        if (!key) return [];
        return this.history.get(key) || [];
    }

    /**
     * Seed sample projects for demo.
     */
    // Sample seeding removed — clean foundation (no demo data).
}

const memoryRepository = new ProjectRepository();
const useSql = process.env.USE_DB_PROJECTS === 'true';

export default useSql ? sqlProjectRepository : memoryRepository;
