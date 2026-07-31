/**
 * In-Memory Test Case Repository
 * Permanent repository for all generated and managed test cases.
 * In production, this would be replaced with a real database (PostgreSQL/MongoDB).
 */

import {
    TestCase, SaveTestCaseInput, BulkSaveTestCaseInput, BulkSaveResult, UpdateTestCaseInput,
    TestCaseFilter, TestCaseAnalytics, TestCaseHistoryEntry, BulkUpdateInput,
    TestCaseStatus, TestCasePriority, TestCaseType, ModuleNode,
} from '../types';
import logger from '../../../shared/logger';
import sqlTestCaseRepository from './test-case.repository.sql';

class TestCaseRepository {
    private testCases: Map<string, TestCase> = new Map();
    private history: Map<string, TestCaseHistoryEntry[]> = new Map();
    private counter: number = 0;
    private sortCounter: number = 0;
    private readonly projects: string[] = [
        'LOGE Admin',
        'LOGE Mobile',
        'LOGE Portal',
        'LOGE API',
    ];

    /**
     * Generate a unique TC ID
     */
    generateTcId(): string {
        this.counter++;
        return `TC-${String(this.counter).padStart(4, '0')}`;
    }

    /**
    /**
     * Save a single test case
     */
    async save(input: SaveTestCaseInput): Promise<TestCase> {
        const id = `tc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const now = new Date().toISOString();
        const tcId = input.tcId || this.generateTcId();
        const sortOrder = input.sortOrder ?? ++this.sortCounter;

        // ── Validation ────────────────────────────────────────────────────────
        // Required fields
        if (!input.module?.trim()) {
            throw new Error('Module is required');
        }
        if (!input.name?.trim()) {
            throw new Error('Test case name is required');
        }
        if (!input.priority) {
            throw new Error('Priority is required');
        }
        if (!input.testSteps || input.testSteps.length === 0) {
            throw new Error('Test steps are required');
        }
        if (!input.expectedResult?.trim()) {
            throw new Error('Expected result is required');
        }

        // Duplicate check: TC ID (if manually entered)
        if (input.tcId) {
            const existing = await this.getByTcId(input.tcId);
            if (existing) {
                throw new Error(`Test case with TC ID "${input.tcId}" already exists`);
            }
        }

        // Duplicate check: Test Case Name within same module (warning only)
        const existingCases = await this.getAll({ projectName: input.projectName, module: input.module });
        const existingName = existingCases.find(tc => tc.name.toLowerCase().trim() === input.name.toLowerCase().trim());
        if (existingName) {
            logger.warn(`Duplicate test case name detected: "${input.name}" in module "${input.module}"`);
        }

        const testCase: TestCase = {
            id,
            tcId,
            projectName: input.projectName,
            module: input.module,
            subModule: input.subModule || '',
            name: input.name,
            description: input.description || '',
            type: input.type || 'functional',
            priority: input.priority,
            testSteps: input.testSteps,
            expectedResult: input.expectedResult,
            testStatus: input.testStatus || 'Not Executed',
            actualResult: input.actualResult || '',
            assignedTo: input.assignedTo || 'Unassigned',
            executionDate: input.executionDate || null,
            comments: input.comments || '',
            relatedBugs: input.relatedBugs || [],
            tags: input.tags || [],
            sortOrder,
            source: input.source ?? 'manual',
            createdAt: now,
            updatedAt: now,
            version: 1,
        };

        this.testCases.set(id, testCase);
        logger.info(`Test case saved: ${tcId} (${testCase.name})`);
        return testCase;
    }

    /**
     * Get test case by TC ID (display ID)
     */
    async getByTcId(tcId: string): Promise<TestCase | undefined> {
        for (const tc of this.testCases.values()) {
            if (tc.tcId === tcId) return tc;
        }
        return undefined;
    }

    /**
     * Bulk save test cases from the generator.
     * Includes duplicate detection: skips cases with the same
     * projectName + module + name (case-insensitive) that already exist.
     */
    async bulkSave(input: BulkSaveTestCaseInput): Promise<BulkSaveResult> {
        const saved: TestCase[] = [];
        let duplicatesSkipped = 0;

        // Build a set of existing case names for this project + module for duplicate detection
        const existing = await this.getAll({ projectName: input.projectName, module: input.module });
        const existingNames = new Set(
            existing.map(tc => tc.name.toLowerCase().trim())
        );

        for (const raw of input.testCases) {
            const name = (raw.name || raw.scenario || 'Untitled Test Case').trim();
            const nameKey = name.toLowerCase().trim();

            // Duplicate detection — skip if a case with the same name already exists
            if (existingNames.has(nameKey)) {
                duplicatesSkipped++;
                continue;
            }
            existingNames.add(nameKey);

            const priority = this.normalizePriority(raw.priority);
            const testCase = await this.save({
                projectName: input.projectName,
                module: raw.module || input.module,
                subModule: input.subModule,
                name,
                description: raw.scenario || '',
                type: this.normalizeType(raw.type),
                priority,
                testSteps: raw.steps || [],
                expectedResult: raw.expectedResult || '',
                tags: raw.tags || [],
                ...(raw.tcId && { tcId: raw.tcId }),
                ...(raw.sortOrder !== undefined && { sortOrder: raw.sortOrder }),
                ...(raw.source && { source: raw.source }),
            });
            saved.push(testCase);
        }

        logger.info(
            `Bulk saved ${saved.length} test cases to project "${input.projectName}" / "${input.module}"` +
            (duplicatesSkipped > 0 ? ` (${duplicatesSkipped} duplicates skipped)` : '')
        );
        return { saved, duplicatesSkipped, total: input.testCases.length };
    }

    /**
     * Get a single test case by ID (supports both internal `id` and display `tcId`)
     */
    async getById(idOrTcId: string): Promise<TestCase | undefined> {
        const direct = this.testCases.get(idOrTcId);
        if (direct) return direct;

        for (const tc of this.testCases.values()) {
            if (tc.tcId === idOrTcId) return tc;
        }
        return undefined;
    }

    /**
     * Resolve any id (internal or tcId) to the internal Map key
     */
    private resolveKey(idOrTcId: string): string | undefined {
        if (this.testCases.has(idOrTcId)) return idOrTcId;
        for (const [key, tc] of this.testCases) {
            if (tc.tcId === idOrTcId) return key;
        }
        return undefined;
    }

    /**
     * Get all test cases with optional filtering
     */
    async getAll(filter?: TestCaseFilter): Promise<TestCase[]> {
        let results = Array.from(this.testCases.values());

        if (!filter) return results.sort((a, b) => a.sortOrder - b.sortOrder || b.createdAt.localeCompare(a.createdAt));

        if (filter.projectName) {
            results = results.filter(tc => tc.projectName === filter.projectName);
        }
        if (filter.module) {
            results = results.filter(tc => tc.module === filter.module);
        }
        if (filter.subModule) {
            results = results.filter(tc => tc.subModule === filter.subModule);
        }
        if (filter.priority) {
            results = results.filter(tc => tc.priority === filter.priority);
        }
        if (filter.testStatus) {
            results = results.filter(tc => tc.testStatus === filter.testStatus);
        }
        if (filter.type) {
            results = results.filter(tc => tc.type === filter.type);
        }
        if (filter.assignedTo) {
            results = results.filter(tc => tc.assignedTo === filter.assignedTo);
        }
        if (filter.search) {
            const q = filter.search.toLowerCase();
            results = results.filter(tc =>
                tc.name.toLowerCase().includes(q) ||
                tc.tcId.toLowerCase().includes(q) ||
                tc.description.toLowerCase().includes(q) ||
                tc.module.toLowerCase().includes(q)
            );
        }

        return results.sort((a, b) => a.sortOrder - b.sortOrder || b.createdAt.localeCompare(a.createdAt));
    }

    /**
     * Update a test case with change tracking
     */
    async update(idOrTcId: string, updates: UpdateTestCaseInput): Promise<{ testCase: TestCase; changes: string[] } | undefined> {
        const key = this.resolveKey(idOrTcId);
        if (!key) return undefined;
        const existing = this.testCases.get(key);
        if (!existing) return undefined;

        const changedBy = updates.changedBy || 'QA Team';
        const now = new Date().toISOString();
        const changes: string[] = [];
        const historyEntries: TestCaseHistoryEntry[] = [];

        const editableFields: (keyof UpdateTestCaseInput)[] = [
            'module', 'subModule', 'name', 'description', 'priority',
            'testStatus', 'actualResult', 'assignedTo', 'executionDate',
            'comments', 'relatedBugs', 'tags',
        ];

        for (const field of editableFields) {
            const newValue = updates[field];
            if (newValue === undefined) continue;

            const oldValue = (existing as any)[field];
            const oldStr = Array.isArray(oldValue) ? JSON.stringify(oldValue) : String(oldValue ?? '');
            const newStr = Array.isArray(newValue) ? JSON.stringify(newValue) : String(newValue ?? '');

            if (oldStr !== newStr) {
                changes.push(field);
                historyEntries.push({
                    id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                    tcId: existing.tcId,
                    changedField: field,
                    oldValue: oldStr,
                    newValue: newStr,
                    changedBy,
                    changedAt: now,
                });
            }
        }

        if (changes.length === 0) {
            return { testCase: existing, changes: [] };
        }

        // Auto-set execution date when status changes to an executed state
        let executionDate = existing.executionDate;
        if (updates.testStatus && updates.testStatus !== 'Not Executed' && !updates.executionDate) {
            executionDate = now;
        }

        const updated: TestCase = {
            ...existing,
            ...(updates.module !== undefined && { module: updates.module }),
            ...(updates.subModule !== undefined && { subModule: updates.subModule }),
            ...(updates.name !== undefined && { name: updates.name }),
            ...(updates.description !== undefined && { description: updates.description }),
            ...(updates.priority !== undefined && { priority: updates.priority }),
            ...(updates.testStatus !== undefined && { testStatus: updates.testStatus }),
            ...(updates.actualResult !== undefined && { actualResult: updates.actualResult }),
            ...(updates.assignedTo !== undefined && { assignedTo: updates.assignedTo }),
            ...(updates.executionDate !== undefined && { executionDate: updates.executionDate }),
            ...(executionDate !== existing.executionDate && { executionDate }),
            ...(updates.comments !== undefined && { comments: updates.comments }),
            ...(updates.relatedBugs !== undefined && { relatedBugs: updates.relatedBugs }),
            ...(updates.tags !== undefined && { tags: updates.tags }),
            id: existing.id,
            updatedAt: now,
            version: existing.version + 1,
        };

        this.testCases.set(key, updated);

        const existingHistory = this.history.get(key) || [];
        this.history.set(key, [...existingHistory, ...historyEntries]);

        logger.info(`Test case updated: ${updated.tcId} (v${updated.version}), changed: [${changes.join(', ')}]`);
        return { testCase: updated, changes };
    }

    /**
     * Bulk update test cases (status, assignee)
     */
    async bulkUpdate(input: BulkUpdateInput): Promise<{ updated: number; testCases: TestCase[] }> {
        const updated: TestCase[] = [];
        for (const id of input.ids) {
            const result = await this.update(id, {
                ...(input.testStatus && { testStatus: input.testStatus }),
                ...(input.assignedTo && { assignedTo: input.assignedTo }),
                changedBy: input.changedBy || 'QA Team',
            });
            if (result) updated.push(result.testCase);
        }
        logger.info(`Bulk updated ${updated.length} test cases`);
        return { updated: updated.length, testCases: updated };
    }

    /**
     * Get edit history for a test case
     */
    async getHistory(idOrTcId: string): Promise<TestCaseHistoryEntry[]> {
        const key = this.resolveKey(idOrTcId);
        if (!key) return [];
        return this.history.get(key) || [];
    }

    /**
     * Delete a test case
     */
    async delete(idOrTcId: string): Promise<boolean> {
        const key = this.resolveKey(idOrTcId);
        if (!key) return false;
        const deleted = this.testCases.delete(key);
        this.history.delete(key);
        if (deleted) logger.info(`Test case deleted: ${idOrTcId}`);
        return deleted;
    }

    /**
     * Delete every test case in a module for a project (the "delete whole module" action).
     * Returns the count removed; 0 when the module has no cases.
     */
    async deleteByModule(projectName: string, module: string): Promise<number> {
        let removed = 0;
        for (const [key, tc] of this.testCases) {
            if (tc.projectName === projectName && tc.module === module) {
                this.testCases.delete(key);
                this.history.delete(key);
                removed++;
            }
        }
        if (removed > 0) {
            logger.info(`Deleted module "${module}" in project "${projectName}": ${removed} test case(s)`);
        }
        return removed;
    }

    /**
     * Get module tree (module -> sub-modules with counts)
     */
    async getModuleTree(projectName?: string): Promise<ModuleNode[]> {
        const cases = await this.getAll({ projectName });
        const moduleMap = new Map<string, Map<string, number>>();

        for (const tc of cases) {
            if (!moduleMap.has(tc.module)) {
                moduleMap.set(tc.module, new Map());
            }
            const subMap = moduleMap.get(tc.module)!;
            const sub = tc.subModule || 'General';
            subMap.set(sub, (subMap.get(sub) || 0) + 1);
        }

        const tree: ModuleNode[] = [];
        for (const [module, subMap] of moduleMap) {
            let total = 0;
            const subModules: Array<{ name: string; count: number }> = [];
            for (const [name, count] of subMap) {
                subModules.push({ name, count });
                total += count;
            }
            tree.push({ module, subModules, totalCount: total });
        }

        return tree.sort((a, b) => b.totalCount - a.totalCount);
    }

    /**
     * Get analytics summary
     */
    async getAnalytics(projectName?: string): Promise<TestCaseAnalytics> {
        const cases = await this.getAll({ projectName });

        const byStatus = this.countBy(cases, 'testStatus') as Record<TestCaseStatus, number>;
        const byPriority = this.countBy(cases, 'priority') as Record<TestCasePriority, number>;
        const byModule = this.countBy(cases, 'module') as Record<string, number>;
        const byType = this.countBy(cases, 'type') as Record<TestCaseType, number>;

        // Ensure all status keys exist
        const statuses: TestCaseStatus[] = ['Not Executed', 'Passed', 'Failed', 'Blocked', 'Skipped'];
        for (const s of statuses) {
            if (!(s in byStatus)) byStatus[s] = 0;
        }

        const priorities: TestCasePriority[] = ['Critical', 'High', 'Medium', 'Low'];
        for (const p of priorities) {
            if (!(p in byPriority)) byPriority[p] = 0;
        }

        const notExecuted = byStatus['Not Executed'] || 0;
        const passed = byStatus['Passed'] || 0;
        const failed = byStatus['Failed'] || 0;
        const blocked = byStatus['Blocked'] || 0;
        const skipped = byStatus['Skipped'] || 0;

        const executed = passed + failed + blocked + skipped;
        const passRate = executed > 0 ? Math.round((passed / executed) * 100) : 0;

        const linkedBugs = cases.reduce((sum, tc) => sum + tc.relatedBugs.length, 0);
        const modulesCovered = Object.keys(byModule).length;

        // Module coverage breakdown
        const moduleCoverageMap = new Map<string, { total: number; passed: number; failed: number; notExecuted: number }>();
        for (const tc of cases) {
            if (!moduleCoverageMap.has(tc.module)) {
                moduleCoverageMap.set(tc.module, { total: 0, passed: 0, failed: 0, notExecuted: 0 });
            }
            const m = moduleCoverageMap.get(tc.module)!;
            m.total++;
            if (tc.testStatus === 'Passed') m.passed++;
            else if (tc.testStatus === 'Failed') m.failed++;
            else if (tc.testStatus === 'Not Executed') m.notExecuted++;
        }

        const moduleCoverage = Array.from(moduleCoverageMap.entries())
            .map(([module, data]) => ({ module, ...data }))
            .sort((a, b) => b.total - a.total);

        // Priority distribution
        const priorityDistribution = priorities.map(p => ({ priority: p, count: byPriority[p] || 0 }));

        // Execution trend (last 7 days)
        const executionTrend = this.buildExecutionTrend(cases);

        // AI Insights
        let mostUntestedModule = 'N/A';
        let remainingCases = 0;
        let lowestPassRateModule = 'N/A';
        let lowestPassRate = 100;

        for (const mc of moduleCoverage) {
            if (mc.notExecuted > remainingCases) {
                remainingCases = mc.notExecuted;
                mostUntestedModule = mc.module;
            }
            const executedInModule = mc.passed + mc.failed;
            if (executedInModule > 0) {
                const rate = Math.round((mc.passed / executedInModule) * 100);
                if (rate < lowestPassRate) {
                    lowestPassRate = rate;
                    lowestPassRateModule = mc.module;
                }
            }
        }

        return {
            totalCases: cases.length,
            byStatus,
            byPriority,
            byModule,
            byType,
            notExecuted,
            passed,
            failed,
            blocked,
            skipped,
            passRate,
            linkedBugs,
            modulesCovered,
            recentCases: cases.slice(0, 10),
            moduleCoverage,
            priorityDistribution,
            executionTrend,
            aiInsights: {
                mostUntestedModule,
                remainingCases,
                lowestPassRateModule,
                lowestPassRate,
            },
        };
    }

    /**
     * Build execution trend for last 7 days
     */
    private buildExecutionTrend(cases: TestCase[]): Array<{ date: string; executed: number; passed: number; failed: number }> {
        const days: Array<{ date: string; executed: number; passed: number; failed: number }> = [];
        const now = new Date();

        for (let i = 6; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().slice(0, 10);
            days.push({ date: dateStr, executed: 0, passed: 0, failed: 0 });
        }

        for (const tc of cases) {
            if (!tc.executionDate) continue;
            const dateStr = tc.executionDate.slice(0, 10);
            const day = days.find(d => d.date === dateStr);
            if (day) {
                day.executed++;
                if (tc.testStatus === 'Passed') day.passed++;
                else if (tc.testStatus === 'Failed') day.failed++;
            }
        }

        return days;
    }

    /**
     * Helper: count cases by a field
     */
    private countBy<T extends keyof TestCase>(cases: TestCase[], field: T): Record<string, number> {
        const counts: Record<string, number> = {};
        for (const tc of cases) {
            const val = String(tc[field]);
            counts[val] = (counts[val] || 0) + 1;
        }
        return counts;
    }

    /**
     * Normalize priority string to TestCasePriority
     */
    private normalizePriority(raw?: string): TestCasePriority {
        if (!raw) return 'Medium';
        const p = raw.toLowerCase();
        if (p.includes('critical') || p === 'p0' || p === 'p1') return 'Critical';
        if (p.includes('high') || p === 'p2') return 'High';
        if (p.includes('low') || p === 'p4') return 'Low';
        return 'Medium';
    }

    /**
     * Normalize type string to TestCaseType
     */
    private normalizeType(raw?: string): TestCaseType {
        if (!raw) return 'functional';
        const t = raw.toLowerCase();
        if (t.includes('negative')) return 'negative';
        if (t.includes('edge')) return 'edge';
        if (t.includes('security')) return 'security';
        if (t.includes('boundary')) return 'boundary';
        if (t.includes('scenario')) return 'scenario';
        return 'functional';
    }

    /**
     * Seed with sample test cases for demo
     */
    // Sample seeding removed — clean foundation (no demo data).
}

const memoryRepository = new TestCaseRepository();
const useSql = process.env.USE_DB_TEST_CASES === 'true';

export default useSql ? sqlTestCaseRepository : memoryRepository;
