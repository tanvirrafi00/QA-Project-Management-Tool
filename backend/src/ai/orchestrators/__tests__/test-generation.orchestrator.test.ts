/**
 * Regression tests for the functional-first Test Generation Orchestrator.
 *
 * Guards the strategy's golden rules (Phase 4 — Functional-First Generation):
 *   1. Functional generation ALWAYS runs before secondary types (call-order).
 *   2. Functional is mandatory even when the user deselects it via `testTypes`.
 *   3. The Phase 4 coverage gate is a BOUNDED completion loop: it expands functional to close
 *      requirement gaps before secondary, but is capped (MAX_FUNCTIONAL_EXPANSIONS) so a
 *      pathological requirement (distinctive token never matched in free text) cannot starve the
 *      count floor — secondary still runs (coverage-first, count-second).
 *   4. Output is sorted functional-first (tabs + type distribution).
 *
 * The five collaborator singletons are jest-mocked so NO real AI / cache / merge calls happen; the
 * aiProviderManager mock records call order and returns canned cases. Pure helpers (prompt
 * builders, jsonParser, PerformanceTimer, constants) run for real.
 */

import orchestrator, { planSecondaryBatches } from '../test-generation.orchestrator';
import requirementProcessor from '../../../services/requirement-processor.service';
import aiProviderManager from '../../providers/provider.manager';
import mergeAgent from '../../agents/merge.agent';
import coverageAgent from '../../agents/coverage.agent';
import resultCache from '../../../shared/cache/result-cache.service';
import type {
    AgentOutput,
    ParsedRequirement,
    ProcessedRequirement,
    TestCaseInput,
} from '../../../shared/types';

jest.mock('../../../shared/logger', () => ({
    __esModule: true,
    default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), aiExecution: jest.fn() },
}));
jest.mock('../../../services/requirement-processor.service', () => ({
    __esModule: true,
    default: {
        process: jest.fn(),
        toParsedRequirement: jest.fn(),
        hashRequirement: jest.fn(),
    },
}));
jest.mock('../../providers/provider.manager', () => ({
    __esModule: true,
    default: { generate: jest.fn() },
}));
jest.mock('../../agents/merge.agent', () => ({
    __esModule: true,
    default: { run: jest.fn() },
}));
jest.mock('../../agents/coverage.agent', () => ({
    __esModule: true,
    default: { run: jest.fn() },
}));
jest.mock('../../../shared/cache/result-cache.service', () => ({
    __esModule: true,
    default: { get: jest.fn(), set: jest.fn(), hashInput: jest.fn() },
}));

// ── Fixtures ──

const requirementFixture: ParsedRequirement = {
    module: 'Authentication',
    feature: 'Password Reset',
    actors: ['User', 'Admin'],
    permissions: [],
    fields: [],
    constraints: [],
    validations: ['Email must match a valid format'],
    businessRules: [
        'Password must include an uppercase letter',
        'quarkgluon flux must stabilize', // gap token — uncovered when absent from functional cases
    ],
    dependencies: [],
    missingInfo: [],
    workflows: [
        'User can reset password via email link',
        'Admin can suspend an account',
    ],
};

const processedFixture: ProcessedRequirement = {
    module: 'Authentication',
    feature: 'Password Reset',
    userStory: 'As a user I want to reset my password',
    acceptanceCriteria: requirementFixture.workflows,
    businessRules: requirementFixture.businessRules,
    permissions: [],
    validations: requirementFixture.validations,
    dependencies: [],
    notifications: [],
    auditLogs: [],
    apiRequirements: [],
    uiRequirements: [],
    actors: requirementFixture.actors,
    fields: [],
    missingInfo: [],
    assumptions: [],
    contradictions: [],
    scores: { completeness: 80, clarity: 80, qaReadiness: 80 },
    markdown: '# Password Reset requirement text',
    originalLength: 100,
    cleanedLength: 100,
    wasChunked: false,
};

/** Raw AI test-case objects (pre-normalization) returned by the mocked provider. */
const functionalRawCases = (includeGap: boolean): any[] => {
    const cases = [
        { name: 'Verify a user can reset password via email link in Authentication', type: 'functional', priority: 'High', steps: ['1. Go'], expectedResult: 'Reset email sent' },
        { name: 'Verify admin can suspend an account in Authentication', type: 'functional', priority: 'Medium', steps: ['1. Go'], expectedResult: 'Account suspended' },
        { name: 'Verify password must include an uppercase letter in Authentication', type: 'functional', priority: 'High', steps: ['1. Go'], expectedResult: 'Weak password rejected' },
    ];
    if (includeGap) {
        cases.push({ name: 'Verify quarkgluon flux stabilizes in Authentication', type: 'functional', priority: 'Low', steps: ['1. Go'], expectedResult: 'Stable' });
    }
    return cases;
};

const secondaryRawCases = (): any[] => [
    { name: 'Verify invalid email format is rejected in Authentication', type: 'validation', priority: 'Medium', steps: ['1. Go'], expectedResult: 'Validation error' },
    { name: 'Verify unauthenticated reset is blocked in Authentication', type: 'security', priority: 'High', steps: ['1. Go'], expectedResult: '401' },
];

describe('TestGenerationOrchestrator — functional-first ordering & bounded gate', () => {
    let callLog: string[];
    let includeGap: boolean;

    beforeEach(() => {
        callLog = [];
        includeGap = true;

        jest.mocked(resultCache.hashInput).mockReturnValue('cachekey');
        jest.mocked(resultCache.get).mockReturnValue(null);
        jest.mocked(resultCache.set).mockImplementation(() => undefined);
        jest.mocked(requirementProcessor.process).mockResolvedValue(processedFixture);
        jest.mocked(requirementProcessor.toParsedRequirement).mockReturnValue(requirementFixture);
        jest.mocked(requirementProcessor.hashRequirement).mockReturnValue('reqhash');
        jest.mocked(mergeAgent.run).mockImplementation(async (outputs: AgentOutput[]) => ({
            deduplicated: outputs.flatMap((o) => o.testCases),
            duplicatesRemoved: 0,
            byCategory: {},
        }));
        jest.mocked(coverageAgent.run).mockResolvedValue({
            score: 80, covered: [], missing: [], risks: [], recommendations: [],
        });
        jest.mocked(aiProviderManager.generate).mockImplementation(async (messages: { role: string; content: string }[]) => {
            const system = messages.find((m) => m.role === 'system')?.content ?? '';
            const isFunctional = /FUNCTIONAL-FIRST/i.test(system);
            callLog.push(isFunctional ? 'functional' : 'secondary');
            const cases = isFunctional ? functionalRawCases(includeGap) : secondaryRawCases();
            return { content: JSON.stringify({ testCases: cases, reasoning: 'mock' }), provider: 'mock', model: 'mock' };
        });
    });

    /** True when every functional call precedes every secondary call (the golden rule). */
    const functionalBeforeSecondary = (log: string[]): boolean => {
        const lastFunc = log.lastIndexOf('functional');
        const firstSec = log.indexOf('secondary');
        return firstSec === -1 || lastFunc < firstSec;
    };

    test('functional generation runs before secondary types (golden rule)', async () => {
        const input: TestCaseInput = {
            moduleName: 'Authentication',
            featureName: 'Password Reset',
            userStory: 'As a user I want to reset my password',
            minTestCases: 2,
            coverageLevel: 'standard',
        };
        const result = await orchestrator.execute(input);

        expect(functionalBeforeSecondary(callLog)).toBe(true);
        expect(callLog[0]).toBe('functional');
        expect(result.strategy?.functionalComplete).toBe(true);
    });

    test('functional is mandatory even when deselected via testTypes', async () => {
        const input: TestCaseInput = {
            moduleName: 'Authentication',
            userStory: 'As a user I want to reset my password',
            minTestCases: 2,
            coverageLevel: 'standard',
            testTypes: ['negative', 'security'], // functional deliberately omitted
        };
        await orchestrator.execute(input);

        // The orchestrator force-includes functional and runs it first regardless of the selection.
        expect(callLog[0]).toBe('functional');
        expect(functionalBeforeSecondary(callLog)).toBe(true);
    });

    test('happy path: coverage complete → no expansion, single functional pass', async () => {
        includeGap = true; // functional cases cover every requirement → 100% coverage
        const input: TestCaseInput = {
            moduleName: 'Authentication',
            userStory: 'As a user I want to reset my password',
            minTestCases: 2,
            coverageLevel: 'standard',
        };
        const result = await orchestrator.execute(input);

        expect(callLog.filter((k) => k === 'functional').length).toBe(1); // Phase 2 only — no Phase 4 expansion
        expect(result.strategy?.functionalComplete).toBe(true);
        expect(result.strategy?.functionalCoverage.uncovered).toHaveLength(0);
        expect(result.strategy?.phases.find((p) => p.phase === 4)?.status).toBe('skipped');
    });

    test('bounded gate: unclosable gap → expansion capped, functionalComplete false, secondary still runs', async () => {
        includeGap = false; // 'quarkgluon' requirement never appears → gap never closes
        const input: TestCaseInput = {
            moduleName: 'Authentication',
            userStory: 'As a user I want to reset my password',
            minTestCases: 30, // high floor keeps the loop from early-outing so the CAP is exercised
            coverageLevel: 'standard',
        };
        const result = await orchestrator.execute(input);

        // Bounded: at most 1 (Phase 2) + MAX_FUNCTIONAL_EXPANSIONS functional passes.
        const functionalCalls = callLog.filter((k) => k === 'functional').length;
        expect(functionalCalls).toBeGreaterThanOrEqual(2); // initial + ≥1 expansion
        expect(functionalCalls).toBeLessThanOrEqual(3); // 1 + MAX_FUNCTIONAL_EXPANSIONS(2)

        // Honest reporting: the gate does not falsely claim completion.
        expect(result.strategy?.functionalComplete).toBe(false);
        expect(result.strategy!.functionalCoverage.uncovered.length).toBeGreaterThan(0);
        expect(result.strategy!.functionalCoverage.uncovered.some((u) => u.includes('quarkgluon'))).toBe(true);

        // Count floor is NOT starved (count-second): secondary still ran after the bounded loop.
        expect(callLog.filter((k) => k === 'secondary').length).toBeGreaterThan(0);
        expect(functionalBeforeSecondary(callLog)).toBe(true);

        // Phase 4 honestly reports 'partial'.
        expect(result.strategy?.phases.find((p) => p.phase === 4)?.status).toBe('partial');
    });

    test('output is sorted functional-first (tabs + type distribution)', async () => {
        const input: TestCaseInput = {
            moduleName: 'Authentication',
            userStory: 'As a user I want to reset my password',
            minTestCases: 2,
            coverageLevel: 'standard',
        };
        const result = await orchestrator.execute(input);

        expect(Object.keys(result.summary.typeDistribution!)[0]).toBe('functional');
        expect(Object.keys(result.testCases)[0]).toBe('functional');
    });

    test('Phase 10: large outputs batch secondary per-type; small outputs mash', async () => {
        includeGap = true; // cover every requirement so Phase 4 only expands for the floor
        const makeInput = (min: number): TestCaseInput => ({
            moduleName: 'Authentication',
            userStory: 'As a user I want to reset my password',
            minTestCases: min,
            coverageLevel: 'standard',
        });

        // Large (minTestCases=300 → secondaryTarget=150 ≥ threshold): per-type → ≥1 call per secondary type
        // (12 secondary types when none are explicitly selected).
        await orchestrator.execute(makeInput(300));
        const largeSecondaryCalls = callLog.filter((k) => k === 'secondary').length;
        expect(largeSecondaryCalls).toBeGreaterThanOrEqual(12);

        // Small (minTestCases=30 → secondaryTarget=15 < threshold): mashed → far fewer secondary calls.
        callLog.length = 0;
        await orchestrator.execute(makeInput(30));
        const smallSecondaryCalls = callLog.filter((k) => k === 'secondary').length;
        expect(smallSecondaryCalls).toBeLessThan(12);
    });
});

describe('planSecondaryBatches (Phase 10 pure decision)', () => {
    test('mashed for small targets', () => {
        expect(planSecondaryBatches(15, 12)).toBe('mashed');
        expect(planSecondaryBatches(49, 12)).toBe('mashed');
    });
    test('per-type for large targets with multiple types', () => {
        expect(planSecondaryBatches(50, 12)).toBe('per-type');
        expect(planSecondaryBatches(150, 5)).toBe('per-type');
    });
    test('mashed even for large targets when only one secondary type', () => {
        expect(planSecondaryBatches(150, 1)).toBe('mashed');
    });
});
