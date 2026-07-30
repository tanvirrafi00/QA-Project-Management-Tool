/**
 * Base Agent
 * Shared logic for all test generation agents
 * Handles: AI calls, response parsing, test case normalization
 */

import aiProviderManager from '../providers/provider.manager';
import jsonParser from '../parsers/json-parser.service';
import logger from '../../shared/logger';
import { DEFAULT_VALUES } from '../../shared/constants';
import {
    ChatMessage,
    AgentTestCase,
    AgentOutput,
} from '../../shared/types';
import { normalizeAgentPriority } from './normalize';

export abstract class BaseAgent {
    abstract readonly name: string;

    /**
     * Run the agent: call AI, parse response, normalize test cases
     */
    protected async runAgent(
        messages: ChatMessage[],
        module: string,
        fallbackReasoning: string
    ): Promise<AgentOutput> {
        const startTime = Date.now();

        const result = await aiProviderManager.generate(messages);
        const duration = Date.now() - startTime;

        logger.info(`${this.name} completed in ${duration}ms via ${result.provider}`);

        // Parse response safely
        const parsed = jsonParser.parseSafe<{ testCases?: any[]; reasoning?: string }>(
            result.content,
            { testCases: [], reasoning: fallbackReasoning }
        );

        // Normalize all test cases
        const testCases = (parsed.testCases || []).map((tc, i) =>
            this.normalizeTestCase(tc, module, i)
        );

        return {
            agent: this.name as any,
            testCases,
            reasoning: parsed.reasoning || `${this.name} generated ${testCases.length} test cases`,
        };
    }

    /**
     * Normalize a test case to ensure all required fields with defaults
     */
    protected normalizeTestCase(tc: any, module: string, index: number): AgentTestCase {
        const id = tc.id || `${this.name.toUpperCase().replace(/-/g, '')}-${String(index + 1).padStart(3, '0')}`;
        return {
            id,
            module: tc.module || module || 'General',
            name: tc.name || tc.scenario || tc.title || `Test Case ${id}`,
            type: tc.type || 'functional',
            priority: normalizeAgentPriority(tc.priority),
            steps: Array.isArray(tc.steps)
                ? tc.steps
                : tc.steps
                    ? [tc.steps]
                    : ['Execute test'],
            expectedResult: tc.expectedResult || tc.expected_result || 'Verify expected behavior',
            tags: Array.isArray(tc.tags) ? tc.tags : [],
            // Excel export defaults
            testStatus: DEFAULT_VALUES.TEST_STATUS,
            actualResult: DEFAULT_VALUES.ACTUAL_RESULT,
            assignedTo: DEFAULT_VALUES.ASSIGNED_TO,
            executionDate: DEFAULT_VALUES.EXECUTION_DATE,
            relatedBugs: DEFAULT_VALUES.RELATED_BUGS,
            comments: DEFAULT_VALUES.COMMENTS,
            // Legacy compatibility
            scenario: tc.scenario || tc.name,
        };
    }
}
