/**
 * Test Generation Service
 * Business logic layer - coordinates between controller and orchestrator
 */

import testGenerationOrchestrator from '../../../ai/orchestrators/test-generation.orchestrator';
import logger from '../../../shared/logger';
import { AIError } from '../../../shared/errors';
import { TestCaseInput, TestGenerationResponse, OrchestratorOptions } from '../../../shared/types';
import generationsRepository from '../../../shared/db/repositories/generations.repository';

const TEST_GEN_AGENTS = ['functional-qa', 'negative-qa', 'edge-case', 'merge', 'coverage'];

class TestGenerationService {
    /**
     * Generate test cases from requirement input. `opts` (Phase 6) forwards an optional progress
     * callback + cancel signal to the orchestrator; absent on the synchronous path.
     */
    async generateTestCases(input: TestCaseInput, opts?: OrchestratorOptions): Promise<TestGenerationResponse> {
        const startTime = Date.now();
        try {
            logger.info('Test generation request received', {
                module: input.moduleName,
                feature: input.featureName,
                textLength: input.userStory?.length || 0,
            });

            const result = await testGenerationOrchestrator.execute(input, opts);

            logger.info('Test generation completed', {
                totalCases: result.summary.totalCases,
                coverage: result.coverage.score,
                timings: result.timings,
            });

            // Record AI provenance (best-effort; no-op without a DB). Provider/model are not surfaced
            // by the multi-agent orchestrator as a single value, so left null here.
            await generationsRepository.record({
                module: input.moduleName ?? null,
                feature: input.featureName ?? null,
                agents: TEST_GEN_AGENTS,
                mergedCaseCount: result.summary?.totalCases ?? null,
                coverageScore: result.coverage?.score ?? null,
                status: 'succeeded',
                durationMs: Date.now() - startTime,
            });

            return result;
        } catch (error: any) {
            await generationsRepository.record({
                module: input.moduleName ?? null,
                feature: input.featureName ?? null,
                agents: TEST_GEN_AGENTS,
                status: 'failed',
                error: error.message || 'Failed to generate test cases',
                durationMs: Date.now() - startTime,
            });
            logger.error('Test generation failed', {
                message: error.message,
                stack: error.stack,
            });

            // Re-throw known errors, wrap unknown ones
            if (error.statusCode) {
                throw error;
            }

            throw new AIError(
                error.message || 'Failed to generate test cases',
                'orchestrator'
            );
        }
    }
}

export default new TestGenerationService();
