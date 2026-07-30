/**
 * Requirement Processor cache-behavior tests (Phase 9).
 *
 * Verifies the Phase 3 requirement-hash cache works end-to-end through `process()` — the three
 * behaviors that were "pending a manual run" since Phase 3: cache-skip (repeat → no AI call),
 * cache-bust (an edit → AI again), and no-key degradation (AI failure → programmatic baseline,
 * still cached). `aiProviderManager` + `logger` are jest-mocked; the real `requirementCache`
 * singleton runs (cleared between tests) so we exercise the genuine store.
 */

import requirementProcessor from '../requirement-processor.service';
import requirementCache from '../../shared/cache/requirement-cache.service';
import aiProviderManager from '../../ai/providers/provider.manager';
import type { TestCaseInput } from '../../shared/types';

jest.mock('../../ai/providers/provider.manager', () => ({
    __esModule: true,
    default: { generate: jest.fn() },
}));
jest.mock('../../shared/logger', () => ({
    __esModule: true,
    default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), aiExecution: jest.fn() },
}));

const baseInput = (): TestCaseInput => ({
    userStory: 'As a user I want to reset my password',
    acceptanceCriteria: 'Given a registered user\nWhen they request a reset\nThen they receive an email',
    businessRules: 'Password must contain an uppercase letter',
});

/** Canned AI analysis JSON (a subset of ProcessedRequirement — defaults fill the rest). */
const aiContent = (module = 'Authentication'): string =>
    JSON.stringify({
        module,
        feature: 'Password Reset',
        acceptanceCriteria: ['User receives reset email'],
        businessRules: ['Password must contain an uppercase letter'],
        fields: [{ name: 'email', type: 'string', rules: [], validations: ['valid format'] }],
        scores: { completeness: 85, clarity: 85, qaReadiness: 85 },
    });

describe('RequirementProcessorService — requirement-hash cache', () => {
    const generate = aiProviderManager.generate as jest.MockedFunction<typeof aiProviderManager.generate>;

    beforeEach(() => {
        requirementCache.clear();
        generate.mockReset();
    });

    test('cache HIT: a repeat requirement skips the AI analysis entirely', async () => {
        generate.mockResolvedValue({ content: aiContent(), provider: 'mock', model: 'mock' });

        const first = await requirementProcessor.process(baseInput());
        const second = await requirementProcessor.process(baseInput()); // identical → cache hit

        expect(generate).toHaveBeenCalledTimes(1);
        expect(second.userStory).toBe(first.userStory);
    });

    test('cache BUST: editing the requirement misses the cache and re-analyzes', async () => {
        generate.mockResolvedValue({ content: aiContent(), provider: 'mock', model: 'mock' });

        await requirementProcessor.process(baseInput());
        const edited: TestCaseInput = {
            ...baseInput(),
            userStory: 'As a user I want to reset my password via SMS code',
        };
        await requirementProcessor.process(edited);

        expect(generate).toHaveBeenCalledTimes(2);
    });

    test('no-key degradation: AI failure falls back to the programmatic baseline, no throw, and is cached', async () => {
        generate.mockRejectedValue(new Error('AI provider down'));

        const result = await requirementProcessor.process(baseInput());
        // Programmatic baseline derived from the input.
        expect(result.module).toBeDefined();
        expect(result.acceptanceCriteria.length).toBe(3); // the 3 lines in baseInput().acceptanceCriteria
        expect(result.businessRules).toContain('Password must contain an uppercase letter');

        // The baseline was cached → a retry does NOT call AI again.
        const callsAfterFirst = generate.mock.calls.length;
        await requirementProcessor.process(baseInput());
        expect(generate.mock.calls.length).toBe(callsAfterFirst);
    });

    test('hashRequirement is deterministic for identical content and is a sha256 hex', () => {
        const h1 = requirementProcessor.hashRequirement(baseInput());
        const h2 = requirementProcessor.hashRequirement(baseInput());
        expect(h1).toBe(h2);
        expect(h1).toMatch(/^[0-9a-f]{64}$/);
    });

    test('hashRequirement is stable across whitespace/case that cleanInput normalizes', () => {
        const input: TestCaseInput = {
            userStory: 'As a user I want to reset my password',
            acceptanceCriteria: '',
            businessRules: '',
        };
        const noisy: TestCaseInput = {
            ...input,
            // Trailing spaces + a duplicate blank line — cleanInput normalizes these away.
            userStory: 'As a user I want to reset my password   \n\n',
        };
        expect(requirementProcessor.hashRequirement(noisy)).toBe(requirementProcessor.hashRequirement(input));
    });
});
