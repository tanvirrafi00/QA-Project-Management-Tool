/**
 * Bug Repository — in-memory implementation (async interface) + persistence selector.
 *
 * Public methods are `async` to share an identical interface with the SQL implementation
 * (`bug.repository.sql.ts`). `USE_DB_BUGS` selects the backend:
 *   - `USE_DB_BUGS=false` (default) → this in-memory repo.
 *   - `USE_DB_BUGS=true`           → the Drizzle/PostgreSQL repo.
 *
 * Migration Roadmap Step 3.2.
 */

import { Bug, SaveBugInput, BugFilter, BugAnalytics, BugLayer, BugSeverity, BugStatus, BugPriority, BugHistoryEntry, UpdateBugInput } from '../types';
import logger from '../../../shared/logger';
import sqlBugRepository from './bug.repository.sql';

class BugRepository {
    private bugs: Map<string, Bug> = new Map();
    private history: Map<string, BugHistoryEntry[]> = new Map();
    private counter: number = 0;
    private readonly projects: string[] = [
        'LOGE Admin',
        'LOGE Mobile',
        'LOGE Portal',
        'LOGE API',
    ];

    /**
     * Generate a unique bug ID
     */
    generateBugId(): string {
        this.counter++;
        return `BUG-${String(Date.now()).slice(-6)}${String(this.counter).padStart(3, '0')}`;
    }

    /**
     * Save a new bug
     */
    async save(input: SaveBugInput): Promise<Bug> {
        const id = `bug_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const now = new Date().toISOString();

        const bug: Bug = {
            id,
            bugId: input.bugId,
            projectId: input.projectName.replace(/\s+/g, '_').toLowerCase(),
            projectName: input.projectName,
            title: input.title,
            description: input.description,
            module: input.module,
            layer: input.layer,
            severity: input.severity,
            priority: input.priority,
            status: input.status || 'Open',
            environment: input.environment || 'Not specified',
            precondition: input.precondition,
            currentBehavior: input.currentBehavior || [],
            stepsToReproduce: input.stepsToReproduce,
            expectedResult: input.expectedResult,
            actualResult: input.actualResult,
            impact: input.impact,
            reporter: input.reporter || 'QA Team',
            assignee: input.assignee || 'Unassigned',
            createdAt: now,
            updatedAt: now,
            version: 1,
            possibleRootCause: input.possibleRootCause,
            suggestedFix: input.suggestedFix,
            similarBugs: input.similarBugs,
            missingInfo: input.missingInfo,
            tags: input.tags,
            aiConfidence: input.aiConfidence,
        };

        this.bugs.set(id, bug);
        logger.info(`Bug saved: ${bug.bugId} (${bug.title})`);
        return bug;
    }

    /**
     * Get a single bug by ID (supports both internal `id` and display `bugId`)
     */
    async getById(idOrBugId: string): Promise<Bug | undefined> {
        // Try direct lookup by internal id first
        const direct = this.bugs.get(idOrBugId);
        if (direct) return direct;

        // Fallback: search by bugId (e.g., "BUG-592562002")
        for (const bug of this.bugs.values()) {
            if (bug.bugId === idOrBugId) return bug;
        }
        return undefined;
    }

    /**
     * Resolve any id (internal or bugId) to the internal Map key
     */
    private resolveKey(idOrBugId: string): string | undefined {
        if (this.bugs.has(idOrBugId)) return idOrBugId;
        for (const [key, bug] of this.bugs) {
            if (bug.bugId === idOrBugId) return key;
        }
        return undefined;
    }

    /**
     * Get all bugs with optional filtering
     */
    async getAll(filter?: BugFilter): Promise<Bug[]> {
        let results = Array.from(this.bugs.values());

        if (!filter) return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

        if (filter.projectName) {
            results = results.filter(b => b.projectName === filter.projectName);
        }
        if (filter.layer) {
            results = results.filter(b => b.layer === filter.layer);
        }
        if (filter.severity) {
            results = results.filter(b => b.severity === filter.severity);
        }
        if (filter.status) {
            results = results.filter(b => b.status === filter.status);
        }
        if (filter.module) {
            results = results.filter(b => b.module === filter.module);
        }
        if (filter.search) {
            const q = filter.search.toLowerCase();
            results = results.filter(b =>
                b.title.toLowerCase().includes(q) ||
                b.bugId.toLowerCase().includes(q) ||
                b.description.toLowerCase().includes(q)
            );
        }

        return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }

    /**
     * Update a bug with change tracking
     * Records history entries for each changed field and increments version
     */
    async update(idOrBugId: string, updates: UpdateBugInput): Promise<{ bug: Bug; changes: string[] } | undefined> {
        const key = this.resolveKey(idOrBugId);
        if (!key) return undefined;
        const existing = this.bugs.get(key);
        if (!existing) return undefined;

        const changedBy = updates.changedBy || 'QA Team';
        const now = new Date().toISOString();
        const changes: string[] = [];
        const historyEntries: BugHistoryEntry[] = [];

        // Fields that can be updated
        const editableFields: (keyof UpdateBugInput)[] = [
            'title', 'severity', 'priority', 'status', 'layer', 'module',
            'assignee', 'environment', 'description', 'impact', 'precondition',
            'expectedResult', 'actualResult', 'currentBehavior', 'stepsToReproduce',
            'possibleRootCause', 'suggestedFix', 'tags',
        ];

        for (const field of editableFields) {
            const newValue = updates[field];
            if (newValue === undefined) continue;

            const oldValue = (existing as any)[field];
            const oldStr = Array.isArray(oldValue) ? JSON.stringify(oldValue) : String(oldValue);
            const newStr = Array.isArray(newValue) ? JSON.stringify(newValue) : String(newValue);

            if (oldStr !== newStr) {
                changes.push(field);
                historyEntries.push({
                    id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                    bugId: existing.bugId,
                    changedField: field,
                    oldValue: oldStr,
                    newValue: newStr,
                    changedBy,
                    changedAt: now,
                });
            }
        }

        if (changes.length === 0) {
            return { bug: existing, changes: [] };
        }

        const updated: Bug = {
            ...existing,
            ...(updates.title !== undefined && { title: updates.title }),
            ...(updates.severity !== undefined && { severity: updates.severity }),
            ...(updates.priority !== undefined && { priority: updates.priority }),
            ...(updates.status !== undefined && { status: updates.status }),
            ...(updates.layer !== undefined && { layer: updates.layer }),
            ...(updates.module !== undefined && { module: updates.module }),
            ...(updates.assignee !== undefined && { assignee: updates.assignee }),
            ...(updates.environment !== undefined && { environment: updates.environment }),
            ...(updates.description !== undefined && { description: updates.description }),
            ...(updates.impact !== undefined && { impact: updates.impact }),
            ...(updates.precondition !== undefined && { precondition: updates.precondition }),
            ...(updates.expectedResult !== undefined && { expectedResult: updates.expectedResult }),
            ...(updates.actualResult !== undefined && { actualResult: updates.actualResult }),
            ...(updates.currentBehavior !== undefined && { currentBehavior: updates.currentBehavior }),
            ...(updates.stepsToReproduce !== undefined && { stepsToReproduce: updates.stepsToReproduce }),
            ...(updates.possibleRootCause !== undefined && { possibleRootCause: updates.possibleRootCause }),
            ...(updates.suggestedFix !== undefined && { suggestedFix: updates.suggestedFix }),
            ...(updates.tags !== undefined && { tags: updates.tags }),
            id: existing.id,
            updatedAt: now,
            version: existing.version + 1,
        };

        this.bugs.set(key, updated);

        // Record history
        const existingHistory = this.history.get(key) || [];
        this.history.set(key, [...existingHistory, ...historyEntries]);

        logger.info(`Bug updated: ${updated.bugId} (v${updated.version}), changed: [${changes.join(', ')}]`);
        return { bug: updated, changes };
    }

    /**
     * Get edit history for a bug
     */
    async getHistory(idOrBugId: string): Promise<BugHistoryEntry[]> {
        const key = this.resolveKey(idOrBugId);
        if (!key) return [];
        return this.history.get(key) || [];
    }

    /**
     * Delete a bug
     */
    async delete(idOrBugId: string): Promise<boolean> {
        const key = this.resolveKey(idOrBugId);
        if (!key) return false;
        const deleted = this.bugs.delete(key);
        this.history.delete(key);
        if (deleted) logger.info(`Bug deleted: ${idOrBugId}`);
        return deleted;
    }

    /**
     * Get analytics summary
     */
    async getAnalytics(projectName?: string): Promise<BugAnalytics> {
        const bugs = await this.getAll({ projectName });

        const byLayer = this.countBy(bugs, 'layer') as Record<BugLayer, number>;
        const bySeverity = this.countBy(bugs, 'severity') as Record<BugSeverity, number>;
        const byStatus = this.countBy(bugs, 'status') as Record<BugStatus, number>;
        const byModule = this.countBy(bugs, 'module') as Record<string, number>;
        const byPriority = this.countBy(bugs, 'priority') as Record<BugPriority, number>;

        const openStatuses: BugStatus[] = ['Open', 'Assigned', 'In Progress', 'Reopened'];
        const openBugs = bugs.filter(b => openStatuses.includes(b.status)).length;
        const criticalBugs = bugs.filter(b => b.severity === 'Critical').length;

        return {
            totalBugs: bugs.length,
            byLayer,
            bySeverity,
            byStatus,
            byModule,
            byPriority,
            openBugs,
            criticalBugs,
            recentBugs: bugs.slice(0, 10),
        };
    }

    /**
     * Find similar bugs by title/description similarity
     */
    async findSimilar(title: string, module: string, limit: number = 3): Promise<string[]> {
        const all = await this.getAll();
        const titleWords = title.toLowerCase().split(/\s+/);

        const scored = all.map(bug => {
            let score = 0;
            if (bug.module === module) score += 2;
            const bugTitleWords = bug.title.toLowerCase().split(/\s+/);
            const overlap = titleWords.filter(w => bugTitleWords.includes(w)).length;
            score += overlap;
            return { bugId: bug.bugId, score };
        });

        return scored
            .filter(s => s.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map(s => s.bugId);
    }

    /**
     * Helper: count bugs by a field
     */
    private countBy<T extends keyof Bug>(bugs: Bug[], field: T): Record<string, number> {
        const counts: Record<string, number> = {};
        for (const bug of bugs) {
            const val = String(bug[field]);
            counts[val] = (counts[val] || 0) + 1;
        }
        return counts;
    }

    /**
     * Seed with sample bugs for demo
     */
    // Sample seeding removed — clean foundation (no demo data).
}

const memoryRepository = new BugRepository();
const useSql = process.env.USE_DB_BUGS === 'true';

export default useSql ? sqlBugRepository : memoryRepository;
