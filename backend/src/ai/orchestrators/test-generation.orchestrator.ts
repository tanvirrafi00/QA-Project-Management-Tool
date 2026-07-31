/**
 * Test Generation Orchestrator — FUNCTIONAL-FIRST coverage strategy.
 *
 * Strict phase order (the strategy's golden rule — functional coverage comes FIRST):
 * 1. Requirement breakdown (cleanup → normalize → extract testable requirements).
 * 2. FUNCTIONAL COVERAGE (mandatory first): a dedicated functional-only pass covering EVERY
 *    functional requirement with detailed, module-consistent names.
 * 3. VALIDATION GATE: programmatic check that every enumerated functional requirement is mapped to
 *    ≥1 functional test case. If any gap → expand functional ONLY (bounded retry, coverage-first)
 *    until coverage is complete or the MAX_FUNCTIONAL_EXPANSIONS cap is hit.
 * 4. FUNCTIONAL EXPANSION (the bounded loop above): closes every gap first, then tops up to the
 *    functional floor. Secondary types are deferred until this loop exits.
 * 5. SECONDARY TEST TYPES (only after functional is complete): UI, Validation, Negative, Boundary,
 *    Workflow, API, Security — complementary cases, each tracing to a real requirement.
 * 6. FINAL COUNT ADJUSTMENT (only if still below the floor): expand secondary dimensions.
 *
 * Merge & dedup + coverage validation run after generation. Output carries:
 *  - `summary.typeDistribution` (single source for tabs/dashboard, sorted FUNCTIONAL FIRST), and
 *  - `strategy` (phase progression + functional-coverage gate result).
 */

import requirementProcessor from '../../services/requirement-processor.service';
import mergeAgent from '../agents/merge.agent';
import coverageAgent from '../agents/coverage.agent';
import resultCache from '../../shared/cache/result-cache.service';
import aiProviderManager from '../providers/provider.manager';
import jsonParser from '../parsers/json-parser.service';
import { PerformanceTimer, AI_CALL_LABEL } from '../../shared/performance/timing';
import logger from '../../shared/logger';
import { AIError, JobCancelledError } from '../../shared/errors';
import { buildFunctionalFirstPrompt } from '../../prompts/test-generation/functional-first.prompt';
import { buildSecondaryTypesPrompt } from '../../prompts/test-generation/secondary-types.prompt';
import {
    COVERAGE_LEVELS,
    GENERATABLE_TEST_TYPES,
    TEST_TYPE_LABELS,
    API_CONFIG,
    DEFAULT_VALUES,
    buildGenerationProgress,
    testTypeOrderIndex,
} from '../../shared/constants';
import {
    TestCaseInput,
    TestGenerationResponse,
    AgentTestCase,
    AgentOutput,
    ParsedRequirement,
    Priority,
    TestCaseType,
    FunctionalCoverage,
    FunctionalFirstStrategy,
    StrategyPhase,
    GenerationTimings,
    OrchestratorOptions,
} from '../../shared/types';

/** Max test cases targeted in a single AI call (kept within the output-token budget). */
const CALL_CAP = 100;
/** Complementary share of the floor allocated to secondary types (functional dominates). */
const SECONDARY_SHARE = 0.5;
/**
 * Phase 10: per-type sequential secondary batching activates only for LARGE outputs. Below this the
 * single mashed pass (one call across all secondary types) is faster; at/above it each secondary type
 * gets its OWN focused pass (Batch 2 Validation → Batch 3 Negative → … → Security) so no call mashes
 * all types — which at scale dilutes per-type coverage. ~50 secondary ≈ a 100-case total.
 */
const LARGE_SECONDARY_THRESHOLD = 50;

/**
 * Phase 10 batching decision (pure — unit-tested). `'per-type'` when the secondary target is large AND
 * there's more than one secondary type; otherwise `'mashed'`.
 */
export function planSecondaryBatches(target: number, typeCount: number): 'mashed' | 'per-type' {
    return target >= LARGE_SECONDARY_THRESHOLD && typeCount > 1 ? 'per-type' : 'mashed';
}
/**
 * Max functional-expansion passes in the Phase 4 completion loop. Functional coverage is pursued
 * to completion FIRST (coverage-first), but the cap guarantees termination — a requirement whose
 * distinctive tokens never appear verbatim in generated test text can't starve the count floor
 * (count-second). The loop also early-outs when a pass closes no gaps (heuristic ceiling reached).
 */
const MAX_FUNCTIONAL_EXPANSIONS = 2;

class TestGenerationOrchestrator {
    async execute(input: TestCaseInput, opts?: OrchestratorOptions): Promise<TestGenerationResponse> {
        const startTime = Date.now();
        const timer = new PerformanceTimer();
        // Phase 6: live progress + cancellation. `enterPhase` emits progress at each phase boundary
        // and doubles as the cancel checkpoint — it throws between phases if the client set the
        // signal. No-op when `opts` is absent (keeps the synchronous path + tests unchanged).
        const enterPhase = (enteringKey: string | null, done = false): void => {
            if (!opts?.onProgress) return;
            if (!done && opts.signal?.cancelled) throw new JobCancelledError();
            opts.onProgress(buildGenerationProgress(enteringKey, done));
        };
        enterPhase('requirement-processing');
        logger.info('🚀 TEST GENERATION (functional-first) STARTED', {
            module: input.moduleName,
            minTestCases: input.minTestCases,
            coverageLevel: input.coverageLevel,
            testTypes: input.testTypes?.length,
        });

        // ── CACHE CHECK ──
        // Key folds in: steering controls (min/level/types) + the requirement-content hash
        // (sha256 of the cleaned full requirement text). An edited requirement — even with the
        // same user story — now correctly busts the full-result cache. Strategy version guards old caches.
        const cacheKey = resultCache.hashInput({
            moduleName: input.moduleName,
            featureName: input.featureName,
            description: `${input.userStory || ''}|min=${input.minTestCases ?? 30}|lvl=${input.coverageLevel ?? 'standard'}|types=${(input.testTypes || []).join(',')}|strategy=functional-first-v1|reqHash=${requirementProcessor.hashRequirement(input)}`,
        });
        const cached = resultCache.get<TestGenerationResponse>(cacheKey);
        if (cached) {
            logger.info(`✅ CACHE HIT — served in ${Date.now() - startTime}ms (0 AI calls)`);
            // Reflect the hit in the timings (near-zero total, 0 AI calls) rather than the stale
            // timings captured when the result was first generated.
            const cacheTimings: GenerationTimings = {
                totalMs: timer.totalMs(),
                cacheHit: true,
                phases: {},
                aiCalls: 0,
                aiTotalMs: 0,
            };
            enterPhase(null, true); // cache hit → instant completion
            return { ...cached, _cached: true, timings: cacheTimings } as any;
        }

        const phases: StrategyPhase[] = [];

        // ── PHASE 1: Requirement breakdown ──
        const processed = await timer.track('requirement-processing', () => requirementProcessor.process(input));
        const requirement = requirementProcessor.toParsedRequirement(processed);
        logger.info(`✅ Phase 1: requirement breakdown — ${processed.cleanedLength} chars`);
        phases.push({
            phase: 1,
            name: 'Requirement Breakdown',
            status: 'complete',
            detail: `Extracted ${this.enumerateFunctionalRequirements(requirement).length} testable functional requirements.`,
        });

        // ── Resolve steering ──
        const selectedTypes = (input.testTypes && input.testTypes.length > 0
            ? input.testTypes
            : [...GENERATABLE_TEST_TYPES]
        ).filter((t) => (GENERATABLE_TEST_TYPES as readonly string[]).includes(t));
        let types = selectedTypes.length > 0 ? selectedTypes : [...GENERATABLE_TEST_TYPES];
        // Functional is MANDATORY first — always include it even if the user deselected it.
        if (!types.includes('functional')) types = ['functional', ...types];

        const multiplier = COVERAGE_LEVELS[input.coverageLevel ?? 'standard']?.multiplier ?? 1;
        const minCount = Math.max(1, input.minTestCases ?? 30);
        const coverageLabel = COVERAGE_LEVELS[input.coverageLevel ?? 'standard']?.label ?? 'Standard';

        // Functional gets the full floor (it must be complete first); secondary gets a complementary share.
        const functionalTarget = Math.max(2, Math.ceil(minCount * multiplier));
        const secondaryTypes = types.filter((t) => t !== 'functional');
        const secondaryTarget = Math.max(2, Math.ceil(minCount * multiplier * SECONDARY_SHARE));

        const module = requirement.module || input.moduleName || requirement.feature || 'General';

        // ── PHASE 2: Functional coverage (mandatory first) ──
        enterPhase('functional-generation');
        let functionalOutputs = await timer.track('functional-generation', () =>
            this.runFunctionalGeneration(
                requirement,
                processed.markdown,
                module,
                functionalTarget,
                coverageLabel,
                [],
                timer,
            ),
        );
        let functionalCases = functionalOutputs.flatMap((o) => o.testCases);
        logger.info(`✅ Phase 2: functional generation — ${functionalCases.length} cases`);

        // ── PHASE 3: Validation gate (programmatic requirement→functional mapping) ──
        let functionalCoverage = this.validateFunctionalCoverage(requirement, functionalCases);
        logger.info(
            `✅ Phase 3: validation gate — ${functionalCoverage.covered}/${functionalCoverage.total} requirements covered` +
            (functionalCoverage.uncovered.length ? ` (${functionalCoverage.uncovered.length} gaps)` : ''),
        );

        // ── PHASE 4: Functional completion loop (coverage-FIRST, then count) ──
        enterPhase('functional-expansion');
        // Close EVERY functional-requirement gap before secondary types, bounded by
        // MAX_FUNCTIONAL_EXPANSIONS so a pathological requirement (distinctive token never matched
        // in free-text cases) cannot starve the count floor. `deficit` is the max of remaining gaps,
        // the floor shortfall, and a half-floor minimum so each pass is worthwhile.
        let expansionPasses = 0;
        let lastUncovered = functionalCoverage.uncovered.length;
        while (
            (functionalCoverage.uncovered.length > 0 || functionalCases.length < functionalTarget) &&
            expansionPasses < MAX_FUNCTIONAL_EXPANSIONS
        ) {
            const deficit = Math.max(
                functionalCoverage.uncovered.length,
                functionalTarget - functionalCases.length,
                Math.ceil(functionalTarget * 0.5),
                4,
            );
            const expansionOutputs = await timer.track('functional-expansion', () =>
                this.runFunctionalGeneration(
                    requirement,
                    processed.markdown,
                    module,
                    deficit,
                    coverageLabel,
                    functionalCoverage.uncovered,
                    timer,
                ),
            );
            functionalOutputs.push(...expansionOutputs);
            functionalCases = functionalOutputs.flatMap((o) => o.testCases);
            functionalCoverage = this.validateFunctionalCoverage(requirement, functionalCases);
            expansionPasses++;
            logger.info(
                `✅ Phase 4: functional expansion pass ${expansionPasses}/${MAX_FUNCTIONAL_EXPANSIONS} (+${deficit} target) — ` +
                `${functionalCases.length} cases, ${functionalCoverage.covered}/${functionalCoverage.total} requirements covered`,
            );
            // Early-out: if this pass closed no gaps AND the count floor is met, the coverage heuristic
            // has hit its ceiling — stop rather than waste the remaining budget.
            if (functionalCoverage.uncovered.length >= lastUncovered && functionalCases.length >= functionalTarget) {
                break;
            }
            lastUncovered = functionalCoverage.uncovered.length;
        }

        if (expansionPasses > 0) {
            phases.push({
                phase: 4,
                name: 'Functional Expansion',
                status: functionalCoverage.uncovered.length === 0 ? 'complete' : 'partial',
                detail:
                    `${expansionPasses} bounded expansion pass(es) — functional now ${functionalCases.length} cases ` +
                    `covering ${functionalCoverage.covered}/${functionalCoverage.total} requirements.`,
            });
        } else {
            phases.push({
                phase: 4,
                name: 'Functional Expansion',
                status: 'skipped',
                detail: 'Functional floor met and no coverage gaps — no expansion needed.',
            });
        }

        phases.push({
            phase: 2,
            name: 'Functional Coverage',
            status: 'complete',
            detail: `${functionalCases.length} functional test cases generated covering ${functionalCoverage.covered}/${functionalCoverage.total} requirements.`,
        });
        phases.push({
            phase: 3,
            name: 'Validation Gate',
            status: functionalCoverage.uncovered.length === 0 ? 'complete' : 'partial',
            detail:
                functionalCoverage.uncovered.length === 0
                    ? 'All functional requirements mapped to ≥1 functional test case.'
                    : `${functionalCoverage.uncovered.length} requirement(s) still uncovered after expansion.`,
        });

        // ── PHASE 5: Secondary test types (only after functional complete) ──
        enterPhase('secondary-generation');
        let secondaryOutputs: AgentOutput[] = [];
        let secondaryCases: AgentTestCase[] = [];
        if (secondaryTypes.length > 0) {
            secondaryOutputs = await timer.track('secondary-generation', () =>
                this.runSecondaryGeneration(
                    requirement,
                    processed.markdown,
                    module,
                    secondaryTypes,
                    secondaryTarget,
                    coverageLabel,
                    timer,
                ),
            );
            secondaryCases = secondaryOutputs.flatMap((o) => o.testCases);
            logger.info(`✅ Phase 5: secondary types [${secondaryTypes.join(', ')}] — ${secondaryCases.length} cases`);
            phases.push({
                phase: 5,
                name: 'Secondary Test Types',
                status: 'complete',
                detail: `${secondaryCases.length} complementary cases across ${secondaryTypes.length} type(s): ${secondaryTypes.join(', ')}.`,
            });
        } else {
            phases.push({
                phase: 5,
                name: 'Secondary Test Types',
                status: 'skipped',
                detail: 'No secondary types selected — functional-only generation.',
            });
        }

        // ── Merge & dedup (functional + secondary) ──
        enterPhase('merge');
        const merged = await timer.track('merge', () =>
            mergeAgent.run([...functionalOutputs, ...secondaryOutputs], requirement),
        );
        logger.info(`✅ Merged — ${merged.deduplicated.length} cases (${merged.duplicatesRemoved} dupes removed)`);

        // Assign globally sequential IDs in canonical type order (Functional first), then by name.
        let finalCases = this.sortAndRenumber(merged.deduplicated);

        // ── PHASE 6: Final count adjustment (only if still below the floor) ──
        enterPhase('final-adjustment');
        if (finalCases.length < minCount && secondaryTypes.length > 0) {
            const shortfall = minCount - finalCases.length + 4;
            finalCases = await timer.track('final-adjustment', async () => {
                const adjOutputs = await this.runSecondaryGeneration(
                    requirement,
                    processed.markdown,
                    module,
                    secondaryTypes,
                    shortfall,
                    coverageLabel,
                    timer,
                );
                const remerged = await mergeAgent.run(
                    [...functionalOutputs, ...secondaryOutputs, ...adjOutputs],
                    requirement,
                );
                return this.sortAndRenumber(remerged.deduplicated);
            });
            logger.info(`✅ Phase 6: final adjustment (+${shortfall} target) — now ${finalCases.length} cases`);
            phases.push({
                phase: 6,
                name: 'Final Count Adjustment',
                status: 'expanded',
                detail: `Expanded secondary dimensions by ${shortfall} to reach ${finalCases.length} total cases.`,
            });
        } else {
            phases.push({
                phase: 6,
                name: 'Final Count Adjustment',
                status: finalCases.length >= minCount ? 'skipped' : 'partial',
                detail:
                    finalCases.length >= minCount
                        ? `Total (${finalCases.length}) meets the requested floor (${minCount}).`
                        : `Only functional selected; generated ${finalCases.length} of ${minCount}.`,
            });
        }

        // ── Total-generation guard (Phases 2–6) ──
        // Every AI pass is resilient to per-call failure (Promise.allSettled → empty AgentOutput), and
        // `requirementProcessor` also swallows AI errors. Without this guard, a *total* AI outage
        // (every call rejected / returned nothing) would produce 0 cases, settle as a silent HTTP 200
        // success, AND poison the result cache for the TTL. A successful generation always yields ≥1
        // case (the functional floor is ≥2), so 0 cases means generation failed → surface a 503 and
        // skip caching (the guard below also short-circuits `resultCache.set`).
        if (finalCases.length === 0) {
            throw new AIError(
                'Test generation produced no test cases — all AI calls failed or returned empty. ' +
                'Verify AI provider configuration (GLM_API_KEY / GEMINI_API_KEY) and retry.',
                'orchestrator',
            );
        }

        // ── Coverage validation ──
        enterPhase('coverage');
        const coverage = await timer.track('coverage', () => coverageAgent.run(requirement, finalCases));

        // ── Build response ──
        enterPhase('formatting');
        timer.mark('format-start');
        const testCases = this.groupByType(finalCases);
        const typeDistribution = this.buildTypeDistribution(finalCases, types);

        // Missing-type detection: selected types that produced no cases (coverage validation layer).
        const missingTypes = types.filter((t) => (typeDistribution[t] ?? 0) === 0);
        if (missingTypes.length > 0) {
            const labels = missingTypes.map((t) => TEST_TYPE_LABELS[t] ?? t);
            coverage.missing.push(...labels.map((l) => `No ${l} test cases generated`));
            coverage.recommendations = [
                ...(coverage.recommendations ?? []),
                `Retry to populate: ${labels.join(', ')}.`,
            ];
            coverage.score = Math.max(0, coverage.score - missingTypes.length * 5);
        }

        // Min-count note (no silent shortfall).
        if (finalCases.length < minCount) {
            coverage.recommendations = [
                ...(coverage.recommendations ?? []),
                `Generated ${finalCases.length} of the requested ${minCount} test cases — try a higher coverage level or more detail in the requirement for fuller coverage.`,
            ];
        }

        const functionalFinalCount = finalCases.filter((tc) => (tc.type || 'functional') === 'functional').length;
        const secondaryFinalCount = finalCases.length - functionalFinalCount;

        // Sort phases by number for a clean progression in the UI.
        phases.sort((a, b) => a.phase - b.phase);

        const strategy: FunctionalFirstStrategy = {
            approach: 'functional-first',
            functionalComplete: functionalCoverage.uncovered.length === 0,
            functionalCount: functionalFinalCount,
            secondaryCount: secondaryFinalCount,
            functionalCoverage,
            phases,
        };

        const response: TestGenerationResponse = {
            feature: requirement.feature,
            module: requirement.module || input.moduleName || requirement.feature,
            summary: {
                totalCases: finalCases.length,
                byType: typeDistribution,
                byPriority: this.buildPriorityCounts(finalCases),
                typeDistribution,
            },
            testCases,
            coverage,
            requirementGaps:
                functionalCoverage.uncovered.length > 0
                    ? functionalCoverage.uncovered
                    : coverage.missing.length > 0
                        ? coverage.missing
                        : processed.missingInfo,
            apiTests: [],
            strategy,
        };

        timer.measure('formatting', 'format-start');
        response.timings = timer.toTimings({ cacheHit: false });
        // Only cache non-degenerate successes — never cache an empty result (would mask outages).
        if (finalCases.length > 0) resultCache.set(cacheKey, response);
        logger.info(
            `🏁 DONE — ${finalCases.length} cases (${functionalFinalCount} functional + ${secondaryFinalCount} secondary), coverage ${coverage.score}%`,
            response.timings,
        );
        enterPhase(null, true);
        return response;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Generation passes
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Functional-only generation (Phase 2 / 4). Splits the target across calls when it exceeds the
     * single-call budget. `focusRequirements` (from the validation gate) steers an expansion pass at
     * the still-uncovered requirements. Resilient to per-call failure (Promise.allSettled).
     */
    private async runFunctionalGeneration(
        requirement: ParsedRequirement,
        markdown: string,
        module: string,
        target: number,
        coverageLabel: string,
        focusRequirements: string[],
        timer: PerformanceTimer,
    ): Promise<AgentOutput[]> {
        const batches = this.splitTarget(target);
        const focusBlock =
            focusRequirements.length > 0
                ? `\n\n# PRIORITY — UNCOVERED FUNCTIONAL REQUIREMENTS (these MUST be covered)\n${focusRequirements.map((r, i) => `${i + 1}. ${r}`).join('\n')}`
                : '';
        logger.info(`Phase 2/4: ${batches.length} functional call(s), target ${target}`);

        const typeSet = new Set(['functional']);
        const results = await Promise.allSettled(
            batches.map((batchTarget) => {
                const { system, user } = buildFunctionalFirstPrompt({
                    requirement,
                    markdown: markdown + focusBlock,
                    module,
                    targetCount: batchTarget,
                    coverageLabel,
                });
                return this.generateOne(system, user, typeSet, 'functional', module, timer);
            }),
        );
        return this.collectOutputs(results, batches.map(() => 'functional'));
    }

    /**
     * Secondary-types generation (Phase 5 / 6). For large outputs (Phase 10) each secondary type is
     * generated in its own focused pass in canonical order; otherwise a single mashed pass (faster).
     * Functional is excluded — it was covered in the dedicated pass.
     */
    private async runSecondaryGeneration(
        requirement: ParsedRequirement,
        markdown: string,
        module: string,
        types: string[],
        target: number,
        coverageLabel: string,
        timer: PerformanceTimer,
    ): Promise<AgentOutput[]> {
        if (planSecondaryBatches(target, types.length) === 'per-type') {
            return this.runSecondaryGenerationByType(requirement, markdown, module, types, target, coverageLabel, timer);
        }

        const batches = this.splitTarget(target);
        const typeSet = new Set(types);
        logger.info(`Phase 5/6: ${batches.length} secondary call(s) for [${types.join(', ')}], target ${target} (mashed)`);

        const results = await Promise.allSettled(
            batches.map((batchTarget) => {
                const { system, user } = buildSecondaryTypesPrompt({
                    requirement,
                    markdown,
                    module,
                    types,
                    targetCount: batchTarget,
                    coverageLabel,
                });
                return this.generateOne(system, user, typeSet, types[0], module, timer);
            }),
        );
        return this.collectOutputs(results, batches.map(() => types.join('+')));
    }

    /**
     * Phase 10 large-output per-type sequential generation. Each secondary type gets its OWN pass
     * (count-sub-batched via splitTarget), in canonical type order (Validation → Negative → Boundary →
     * … → Security). Types run sequentially so each call stays tightly scoped to one type — at scale
     * this keeps per-type coverage focused and within the output-token budget.
     */
    private async runSecondaryGenerationByType(
        requirement: ParsedRequirement,
        markdown: string,
        module: string,
        types: string[],
        target: number,
        coverageLabel: string,
        timer: PerformanceTimer,
    ): Promise<AgentOutput[]> {
        const orderedTypes = [...types].sort((a, b) => testTypeOrderIndex(a) - testTypeOrderIndex(b));
        const perTypeTarget = Math.max(2, Math.ceil(target / orderedTypes.length));
        logger.info(
            `Phase 5/6 (large-output per-type): ${orderedTypes.length} type(s) [${orderedTypes.join(', ')}], ~${perTypeTarget} each, target ${target}`,
        );

        const allOutputs: AgentOutput[] = [];
        for (const type of orderedTypes) {
            const batches = this.splitTarget(perTypeTarget);
            const typeSet = new Set([type]);
            const results = await Promise.allSettled(
                batches.map((batchTarget) => {
                    const { system, user } = buildSecondaryTypesPrompt({
                        requirement,
                        markdown,
                        module,
                        types: [type],
                        targetCount: batchTarget,
                        coverageLabel,
                    });
                    return this.generateOne(system, user, typeSet, type, module, timer);
                }),
            );
            allOutputs.push(...this.collectOutputs(results, batches.map(() => type)));
        }
        return allOutputs;
    }

    /** One AI pass → normalized cases, each tagged with a valid type. */
    private async generateOne(
        system: string,
        user: string,
        typeSet: Set<string>,
        fallbackType: string,
        module: string,
        timer: PerformanceTimer,
    ): Promise<AgentOutput> {
        const result = await timer.track(AI_CALL_LABEL, () =>
            aiProviderManager.generate(
                [
                    { role: 'system', content: system },
                    { role: 'user', content: user },
                ],
                { maxTokens: API_CONFIG.GENERATION_MAX_TOKENS },
            ),
        );
        const parsed = jsonParser.parseSafe<any>(result.content, { testCases: [] });
        // The model may return a bare array OR {testCases:[...]} / {cases:[...]} — accept all.
        const rawReasoning = !Array.isArray(parsed) ? parsed?.reasoning : undefined;
        const rawCases: any[] = Array.isArray(parsed)
            ? parsed
            : parsed?.testCases ?? parsed?.cases ?? [];
        if (rawCases.length === 0) {
            logger.warn(`[${fallbackType}] parsed 0 cases — content: ${result.content.substring(0, 300)}`);
        }
        const testCases = rawCases.map((tc: any, i: number) =>
            this.normalizeTestCase(tc, this.resolveType(tc.type, typeSet, fallbackType), module, i),
        );
        return {
            agent: fallbackType,
            testCases,
            reasoning: rawReasoning || `${fallbackType}: ${testCases.length} cases`,
        };
    }

    /** Collect allSettled results into AgentOutputs, logging failures and emitting empty outputs. */
    private collectOutputs(results: PromiseSettledResult<AgentOutput>[], labels: string[]): AgentOutput[] {
        const outputs: AgentOutput[] = [];
        results.forEach((r, i) => {
            const label = labels[i];
            if (r.status === 'fulfilled') {
                outputs.push(r.value);
                logger.info(`[${label}]: ${r.value.testCases.length} cases`);
            } else {
                logger.warn(`[${label}] failed: ${r.reason?.message || 'unknown'}`);
                outputs.push({
                    agent: label,
                    testCases: [],
                    reasoning: `Generation failed: ${r.reason?.message || 'unknown'}`,
                });
            }
        });
        return outputs;
    }

    /** Split a target count into batches that each fit the single-call output budget. */
    private splitTarget(target: number): number[] {
        if (target <= CALL_CAP) return [target];
        const n = Math.max(2, Math.ceil(target / CALL_CAP));
        const per = Math.ceil(target / n);
        const batches: number[] = [];
        let remaining = target;
        while (remaining > 0) {
            const t = Math.min(per, remaining);
            batches.push(t);
            remaining -= t;
        }
        return batches.length > 0 ? batches : [target];
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Validation gate (Phase 3)
    // ─────────────────────────────────────────────────────────────────────────────

    /** Enumerate the discrete, testable functional requirements from the parsed requirement. */
    private enumerateFunctionalRequirements(requirement: ParsedRequirement): string[] {
        return [
            ...(requirement.workflows ?? []),
            ...(requirement.businessRules ?? []),
            ...(requirement.validations ?? []),
            ...(requirement.permissions ?? []),
            ...(requirement.fields ?? []).map((f) => f.name),
        ];
    }

    /**
     * Programmatic requirement→functional mapping (the validation gate). A requirement is "covered"
     * if any of its distinctive tokens appears in a functional test case's text. Returns the gap list
     * so Phase 4 can target it.
     */
    private validateFunctionalCoverage(
        requirement: ParsedRequirement,
        functionalCases: AgentTestCase[],
    ): FunctionalCoverage {
        const reqs = this.enumerateFunctionalRequirements(requirement);
        if (reqs.length === 0) {
            return { total: 0, covered: 0, uncovered: [] };
        }
        const haystack = functionalCases
            .map((tc) => `${tc.name} ${tc.scenario || ''} ${(tc.steps || []).join(' ')} ${tc.expectedResult}`.toLowerCase())
            .join(' \n ');
        const uncovered: string[] = [];
        let covered = 0;
        for (const req of reqs) {
            const tokens = req
                .toLowerCase()
                .split(/[^a-z0-9]+/)
                .filter((t) => t.length > 4);
            const matched = tokens.length === 0 || tokens.some((tok) => haystack.includes(tok));
            if (matched) {
                covered++;
            } else {
                uncovered.push(req.length > 90 ? `${req.substring(0, 90)}…` : req);
            }
        }
        return { total: reqs.length, covered, uncovered };
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Normalization & helpers
    // ─────────────────────────────────────────────────────────────────────────────

    /** Coerce the model's type label into the selected set (defends against aliases / typos). */
    private resolveType(raw: any, typeSet: Set<string>, fallback: string): TestCaseType {
        const t = String(raw ?? '').toLowerCase().trim();
        if (typeSet.has(t)) return t as TestCaseType;
        if (t.includes('sec')) return (typeSet.has('security') ? 'security' : fallback) as TestCaseType;
        if (t.includes('bound')) return (typeSet.has('boundary') ? 'boundary' : fallback) as TestCaseType;
        if (t.includes('neg')) return (typeSet.has('negative') ? 'negative' : fallback) as TestCaseType;
        if (t.includes('func') || t.includes('positive'))
            return (typeSet.has('functional') ? 'functional' : fallback) as TestCaseType;
        return fallback as TestCaseType;
    }

    /** Normalize a raw AI test-case object, FORCING the target type AND the user's module so every
     *  case reflects the module the user typed (the model never overrides it). */
    private normalizeTestCase(tc: any, type: TestCaseType, module: string, index: number): AgentTestCase {
        const prefix = String(type).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'TC';
        const id = tc.id || `${prefix}-${String(index + 1).padStart(3, '0')}`;
        return {
            id,
            module: module || tc.module || 'General',
            name: tc.name || tc.scenario || tc.title || `Test Case ${id}`,
            type,
            priority: this.normalizePriority(tc.priority),
            steps: Array.isArray(tc.steps) ? tc.steps : tc.steps ? [tc.steps] : ['Execute test'],
            expectedResult: tc.expectedResult || tc.expected_result || 'Verify expected behavior',
            tags: Array.isArray(tc.tags) ? tc.tags : [],
            testStatus: DEFAULT_VALUES.TEST_STATUS,
            actualResult: DEFAULT_VALUES.ACTUAL_RESULT,
            assignedTo: DEFAULT_VALUES.ASSIGNED_TO,
            executionDate: DEFAULT_VALUES.EXECUTION_DATE,
            relatedBugs: DEFAULT_VALUES.RELATED_BUGS,
            comments: DEFAULT_VALUES.COMMENTS,
            scenario: tc.scenario || tc.name,
        };
    }

    private normalizePriority(priority: any): Priority {
        if (!priority) return 'Medium';
        const p = String(priority).toLowerCase().trim();
        if (p.includes('crit')) return 'Critical';
        if (p.includes('high')) return 'High';
        if (p.includes('low')) return 'Low';
        return 'Medium';
    }

    /** Group cases into a dynamic type → cases map. */
    private groupByType(cases: AgentTestCase[]): Record<string, AgentTestCase[]> {
        const out: Record<string, AgentTestCase[]> = {};
        for (const tc of cases) {
            const key = tc.type || 'functional';
            (out[key] ??= []).push(tc);
        }
        return out;
    }

    /**
     * Sort cases into canonical type order (FUNCTIONAL FIRST) then by name, and assign globally
     * sequential IDs (TC-0001, TC-0002, …) so the result table sorts by TC ID into a clean sequence.
     */
    private sortAndRenumber(cases: AgentTestCase[]): AgentTestCase[] {
        const sorted = [...cases].sort((a, b) => {
            const oa = testTypeOrderIndex(a.type || 'functional');
            const ob = testTypeOrderIndex(b.type || 'functional');
            if (oa !== ob) return oa - ob;
            return (a.name || '').localeCompare(b.name || '');
        });
        const width = Math.max(4, String(sorted.length).length);
        return sorted.map((tc, i) => ({
            ...tc,
            id: `TC-${String(i + 1).padStart(width, '0')}`,
        }));
    }

    /** Per-type counts — single source for the dashboard + tabs. Inserted in CANONICAL order
     *  (Functional first) so Object.entries iterates in the spec's strict tab order. */
    private buildTypeDistribution(cases: AgentTestCase[], selectedTypes: string[]): Record<string, number> {
        const dist: Record<string, number> = {};
        const orderedTypes = [...selectedTypes].sort((a, b) => testTypeOrderIndex(a) - testTypeOrderIndex(b));
        for (const t of orderedTypes) dist[t] = 0;
        for (const tc of cases) {
            const key = tc.type || 'functional';
            dist[key] = (dist[key] ?? 0) + 1;
        }
        return dist;
    }

    private buildPriorityCounts(cases: AgentTestCase[]): Record<string, number> {
        const counts: Record<string, number> = { Critical: 0, High: 0, Medium: 0, Low: 0 };
        for (const tc of cases) {
            const p = tc.priority || 'Medium';
            counts[p] = (counts[p] ?? 0) + 1;
        }
        return counts;
    }
}

export default new TestGenerationOrchestrator();
