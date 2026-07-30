/**
 * Merge Agent
 * Merges test cases from all agents, removes duplicates, assigns sequential IDs
 * Falls back to programmatic merge if AI merge fails
 */

import logger from '../../shared/logger';
import { DEFAULT_VALUES } from '../../shared/constants';
import {
    AgentOutput,
    AgentTestCase,
    MergedTestCases,
    ParsedRequirement,
} from '../../shared/types';
import { normalizeAgentPriority } from './normalize';

class MergeAgent {
    readonly name = 'merge';

    /**
     * Merge agent outputs - uses fast programmatic merge (AI merge was too slow and unreliable)
     */
    async run(agentOutputs: AgentOutput[], requirement: ParsedRequirement): Promise<MergedTestCases> {
        const allCases = agentOutputs.flatMap(o => o.testCases);

        if (allCases.length === 0) {
            logger.warn('No test cases to merge');
            return this.emptyResult();
        }

        // Use programmatic merge directly - instant, reliable, no AI latency
        return this.programmaticMerge(agentOutputs, requirement);
    }

    /**
     * Programmatic merge fallback - dedup by name similarity
     */
    private programmaticMerge(agentOutputs: AgentOutput[], requirement: ParsedRequirement): MergedTestCases {
        const allCases = agentOutputs.flatMap(o => o.testCases);
        const seen = new Set<string>();
        const deduped: AgentTestCase[] = [];

        for (const tc of allCases) {
            const normalized = this.normalizeTestCase(tc, requirement.module, deduped.length);
            const key = normalized.name.toLowerCase().replace(/\s+/g, ' ').trim();

            if (!seen.has(key)) {
                seen.add(key);
                deduped.push(normalized);
            }
        }

        const byCategory = this.categorize(deduped);

        return {
            deduplicated: deduped,
            duplicatesRemoved: allCases.length - deduped.length,
            byCategory,
        };
    }

    /**
     * Group test cases into categories by type
     */
    private categorize(cases: AgentTestCase[]): Record<string, AgentTestCase[]> {
        const byCategory: Record<string, AgentTestCase[]> = {
            scenarios: [],
            positive: [],
            negative: [],
            edge: [],
            security: [],
            boundary: [],
        };

        for (const tc of cases) {
            const type = (tc.type || 'functional').toLowerCase();
            if (type.includes('security')) {
                byCategory.security.push(tc);
            } else if (type.includes('boundary')) {
                byCategory.boundary.push(tc);
            } else if (type.includes('edge')) {
                byCategory.edge.push(tc);
            } else if (type.includes('negative')) {
                byCategory.negative.push(tc);
            } else if (type.includes('scenario') || type.includes('workflow')) {
                byCategory.scenarios.push(tc);
            } else {
                byCategory.positive.push(tc);
            }
        }

        return byCategory;
    }

    /**
     * Normalize a test case with all default fields
     */
    private normalizeTestCase(tc: any, module: string, index: number): AgentTestCase {
        const prefix = module.toUpperCase().replace(/\s+/g, '_').substring(0, 15);
        const id = tc.id || `${prefix}-TC-${String(index + 1).padStart(3, '0')}`;
        return {
            id,
            module: tc.module || module || 'General',
            name: tc.name || tc.scenario || tc.title || `Test Case ${id}`,
            type: tc.type || 'functional',
            priority: normalizeAgentPriority(tc.priority),
            steps: Array.isArray(tc.steps) ? tc.steps : tc.steps ? [tc.steps] : ['Execute test'],
            expectedResult: tc.expectedResult || tc.expected_result || 'Verify expected behavior',
            tags: Array.isArray(tc.tags) ? tc.tags : [],
            testStatus: tc.testStatus || DEFAULT_VALUES.TEST_STATUS,
            actualResult: DEFAULT_VALUES.ACTUAL_RESULT,
            assignedTo: DEFAULT_VALUES.ASSIGNED_TO,
            executionDate: DEFAULT_VALUES.EXECUTION_DATE,
            relatedBugs: DEFAULT_VALUES.RELATED_BUGS,
            comments: DEFAULT_VALUES.COMMENTS,
            scenario: tc.scenario || tc.name,
        };
    }

    private emptyResult(): MergedTestCases {
        return {
            deduplicated: [],
            duplicatesRemoved: 0,
            byCategory: {
                scenarios: [],
                positive: [],
                negative: [],
                edge: [],
                security: [],
                boundary: [],
            },
        };
    }
}

export default new MergeAgent();
