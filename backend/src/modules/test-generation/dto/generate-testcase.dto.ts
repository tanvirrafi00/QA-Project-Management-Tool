/**
 * DTO: Generate Test Cases Request
 * Validates and transforms incoming request data, including the steering controls
 * (minimum case count, coverage level, selected test types, module selection).
 */

import { TestCaseInput } from '../../../shared/types';
import { ValidationError } from '../../../shared/errors';
import {
    COVERAGE_LEVELS,
    GENERATABLE_TEST_TYPES,
    GENERATION_MODULES,
    CUSTOM_MODULE,
    type CoverageLevel,
} from '../../../shared/constants';

const MIN_TEST_CASES_CAP = 1000;

export class GenerateTestCaseDto {
    /**
     * Validate and transform request body into TestCaseInput.
     *
     * Steering controls are lenient with sensible defaults so the endpoint never 500s on a missing
     * field — the UI enforces "required" client-side. Defaults: minTestCases=30, standard coverage,
     * all generatable types.
     */
    static fromRequest(body: any): TestCaseInput {
        const userStory = (body.userStory || '').toString().trim();

        if (!userStory || userStory.length === 0) {
            throw new ValidationError('User story is required. Please provide a requirement description.');
        }

        if (userStory.length < 10) {
            throw new ValidationError('User story is too short. Please provide at least 10 characters.');
        }

        // ── Module resolution: the user picks a module; "Custom Module" reveals a free-text name.
        // The user — not the AI — decides the module.
        const rawModule = (body.module || '').toString().trim();
        const isCustom = rawModule === CUSTOM_MODULE;
        const customName = (body.moduleName || '').toString().trim();
        if (isCustom && !customName) {
            throw new ValidationError('Custom module name is required when "Custom Module" is selected.');
        }
        const resolvedModule = isCustom
            ? customName
            : rawModule && (GENERATION_MODULES as readonly string[]).includes(rawModule)
              ? rawModule
              : customName || rawModule || undefined;

        return {
            projectName: (body.projectName || '').toString().trim() || undefined,
            module: resolvedModule,
            subModule: (body.subModule || '').toString().trim() || undefined,
            moduleName: resolvedModule,
            featureName: (body.featureName || '').toString().trim() || undefined,
            userStory,
            acceptanceCriteria: (body.acceptanceCriteria || '').toString().trim() || undefined,
            businessRules: (body.businessRules || '').toString().trim() || undefined,
            ...this.parseSteering(body),
        };
    }

    /** Parse + validate the steering controls (min count, coverage level, test types). */
    private static parseSteering(body: any): Pick<TestCaseInput, 'minTestCases' | 'coverageLevel' | 'testTypes'> {
        // minTestCases — integer ≥ 1, capped.
        const rawMin = Number(body.minTestCases);
        const minTestCases =
            Number.isFinite(rawMin) && rawMin >= 1
                ? Math.min(Math.floor(rawMin), MIN_TEST_CASES_CAP)
                : 30;

        // coverageLevel — must be one of the defined levels.
        const rawLevel = (body.coverageLevel || '').toString().trim();
        const coverageLevel: CoverageLevel =
            rawLevel && rawLevel in COVERAGE_LEVELS ? (rawLevel as CoverageLevel) : 'standard';

        // testTypes — keep only valid generatable types; default to all.
        const requested: string[] = Array.isArray(body.testTypes)
            ? body.testTypes.map((t: unknown) => String(t ?? '').trim()).filter(Boolean)
            : [];
        const testTypes = requested.filter((t: string) =>
            (GENERATABLE_TEST_TYPES as readonly string[]).includes(t),
        );
        const finalTypes = testTypes.length > 0 ? testTypes : [...GENERATABLE_TEST_TYPES];

        return { minTestCases, coverageLevel, testTypes: finalTypes };
    }
}
