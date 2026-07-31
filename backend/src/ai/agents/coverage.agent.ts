/**
 * Coverage Validation Agent
 * Analyzes test coverage against requirements, identifies gaps
 */

import aiProviderManager from '../providers/provider.manager';
import jsonParser from '../parsers/json-parser.service';
import logger from '../../shared/logger';
import { coveragePrompt } from '../../prompts/test-generation/coverage.prompt';
import {
    AgentTestCase,
    CoverageResult,
    ParsedRequirement,
} from '../../shared/types';

class CoverageAgent {
    readonly name = 'coverage';

    /**
     * Validate coverage of test cases against requirements
     * Uses programmatic analysis (no AI call) for instant results
     */
    async run(requirement: ParsedRequirement, testCases: AgentTestCase[]): Promise<CoverageResult> {
        if (testCases.length === 0) {
            return this.defaultCoverage('No test cases generated');
        }

        // Programmatic coverage analysis - instant, no AI latency
        return this.heuristicCoverage(requirement, testCases);
    }

    /**
     * Estimate coverage based on test case count and requirement complexity
     */
    private estimateCoverage(requirement: ParsedRequirement, testCases: AgentTestCase[]): number {
        const fieldCount = requirement.fields?.length || 0;
        const validationCount = requirement.validations?.length || 0;
        const expectedMin = Math.max(10, fieldCount * 2 + validationCount);

        const ratio = Math.min(testCases.length / expectedMin, 1);
        const baseScore = Math.round(ratio * 100);

        // Bonus for having multiple types
        const types = new Set(testCases.map(tc => tc.type));
        const typeBonus = Math.min(types.size * 5, 20);

        return Math.min(baseScore + typeBonus, 100);
    }

    /**
     * Heuristic coverage when AI fails
     */
    private heuristicCoverage(requirement: ParsedRequirement, testCases: AgentTestCase[]): CoverageResult {
        const covered: string[] = [];
        const missing: string[] = [];

        // Check field coverage
        for (const field of requirement.fields || []) {
            const hasTest = testCases.some(tc =>
                JSON.stringify(tc).toLowerCase().includes(field.name.toLowerCase())
            );
            if (hasTest) {
                covered.push(`Field: ${field.name}`);
            } else {
                missing.push(`No tests for field: ${field.name}`);
            }
        }

        // Check validation coverage — a single negative/edge/boundary case covers the validation
        // category as a whole, so report it once (previously it was pushed once *per* validation,
        // duplicating "Validation testing" N times). Validations with no such coverage are now gaps.
        const hasValidationTests = testCases.some(
            (tc) => tc.type === 'negative' || tc.type === 'edge' || tc.type === 'boundary',
        );
        const validationCount = requirement.validations?.length ?? 0;
        if (validationCount > 0) {
            if (hasValidationTests) {
                covered.push('Validation testing');
            } else {
                missing.push(`${validationCount} validation rule(s) lack negative/edge/boundary coverage`);
            }
        }

        const score = this.estimateCoverage(requirement, testCases);

        return {
            score,
            covered: covered.length > 0 ? covered : ['Core functionality'],
            missing,
            risks: missing.length > 3 ? ['Multiple coverage gaps'] : [],
            recommendations: missing.length > 0
                ? ['Add tests for uncovered fields and validations']
                : ['Coverage looks good'],
        };
    }

    private defaultCoverage(reason: string): CoverageResult {
        return {
            score: 0,
            covered: [],
            missing: [reason],
            risks: ['No test coverage'],
            recommendations: ['Generate test cases first'],
        };
    }
}

export default new CoverageAgent();
