/**
 * Requirement Cache Service tests (Phase 9 — verifies the Phase 3 requirement-hash cache).
 *
 * Covers the in-memory cache mechanics the process() pipeline relies on: round-trip, TTL expiry,
 * deep-clone isolation (a returned entry can't mutate the cache), and the entry cap with eviction.
 * No AI / no DB — pure store.
 */

import requirementCache from '../requirement-cache.service';
import type { ProcessedRequirement } from '../../types';

const fixture = (module = 'Auth'): ProcessedRequirement => ({
    module,
    feature: 'Reset',
    userStory: 'As a user I want to reset my password',
    acceptanceCriteria: ['AC1', 'AC2'],
    businessRules: ['BR1'],
    permissions: [],
    validations: [],
    dependencies: [],
    notifications: [],
    auditLogs: [],
    apiRequirements: [],
    uiRequirements: [],
    actors: ['User'],
    fields: [],
    missingInfo: [],
    assumptions: [],
    contradictions: [],
    scores: { completeness: 80, clarity: 80, qaReadiness: 80 },
    markdown: '# Auth',
    originalLength: 100,
    cleanedLength: 90,
    wasChunked: false,
});

describe('RequirementCacheService', () => {
    beforeEach(() => {
        requirementCache.clear();
    });

    test('get returns null for an unknown hash', () => {
        expect(requirementCache.get('unknown')).toBeNull();
    });

    test('set then get round-trips the processed requirement', () => {
        requirementCache.set('hash-1', fixture());
        const got = requirementCache.get<ProcessedRequirement>('hash-1');
        expect(got).not.toBeNull();
        expect(got?.module).toBe('Auth');
        expect(got?.acceptanceCriteria).toEqual(['AC1', 'AC2']);
    });

    test('an expired entry is evicted on read (TTL)', async () => {
        requirementCache.set('hash-ttl', fixture(), 1); // 1ms TTL
        await new Promise((r) => setTimeout(r, 5));
        expect(requirementCache.get('hash-ttl')).toBeNull();
    });

    test('get returns a deep clone — mutating the result does not affect the cache', () => {
        requirementCache.set('hash-iso', fixture());
        const first = requirementCache.get<ProcessedRequirement>('hash-iso');
        first?.acceptanceCriteria.push('MUTATED');
        const second = requirementCache.get<ProcessedRequirement>('hash-iso');
        expect(second?.acceptanceCriteria).not.toContain('MUTATED');
    });

    test('evicts the oldest entry once the cap is reached', () => {
        const stats = requirementCache.getStats();
        // Fill to the cap, then one beyond — the oldest (first inserted) must be evicted.
        for (let i = 0; i < stats.maxEntries + 1; i++) {
            requirementCache.set(`hash-${i}`, fixture(`M${i}`));
        }
        const after = requirementCache.getStats();
        expect(after.entries).toBeLessThanOrEqual(stats.maxEntries);
        // The very first entry was the oldest → evicted.
        expect(requirementCache.get('hash-0')).toBeNull();
        // A recent entry survives.
        expect(requirementCache.get<ProcessedRequirement>(`hash-${stats.maxEntries}`)?.module).toBe(
            `M${stats.maxEntries}`,
        );
    });
});
