/**
 * Generation Job Service tests (Phase 6).
 *
 * Guards the job lifecycle without real AI or a DB: `testGenerationService` is jest-mocked so
 * `generateTestCases` resolves/rejects on demand and we can assert the orchestrator `opts`
 * (progress callback) are forwarded. The in-memory GenerationJobRepository runs for real.
 */

import generationJobService from '../generation-job.service';
import testGenerationService from '../test-generation.service';
import type { GenerationJobSnapshot, OrchestratorOptions, TestGenerationResponse } from '../../../../shared/types';

jest.mock('../test-generation.service', () => ({
    __esModule: true,
    default: { generateTestCases: jest.fn() },
}));
jest.mock('../../../../shared/logger', () => ({
    __esModule: true,
    default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), aiExecution: jest.fn() },
}));

const fixtureResult = (): TestGenerationResponse => ({
    feature: 'Password Reset',
    module: 'Authentication',
    summary: {
        totalCases: 5,
        byType: { functional: 3, validation: 2 },
        byPriority: { Critical: 0, High: 5, Medium: 0, Low: 0 },
    },
    testCases: { functional: [], validation: [] },
    coverage: { score: 90, covered: [], missing: [], risks: [] },
    requirementGaps: [],
    apiTests: [],
});

/** Poll a job until it reaches a terminal status (bounded — the mock resolves immediately). */
const pollUntilTerminal = async (jobId: string) => {
    let snap = await generationJobService.getJob(jobId);
    for (let i = 0; i < 50 && snap && snap.status !== 'COMPLETED' && snap.status !== 'FAILED' && snap.status !== 'CANCELLED'; i++) {
        await new Promise((r) => setTimeout(r, 10));
        snap = await generationJobService.getJob(jobId);
    }
    return snap;
};

describe('GenerationJobService', () => {
    test('createJob returns immediately with QUEUED; forwards progress opts; settles COMPLETED', async () => {
        let receivedOpts: OrchestratorOptions | undefined;
        jest.mocked(testGenerationService.generateTestCases).mockImplementation(async (_input, opts) => {
            receivedOpts = opts;
            opts?.onProgress?.({ percent: 25, currentPhase: 'functional-generation', phases: [] });
            return fixtureResult();
        });

        const created = await generationJobService.createJob({ userStory: 'As a user I want to reset my password' });

        // Returns immediately, before generation finishes.
        expect(created.status).toBe('QUEUED');
        expect(created.jobId).toMatch(/^job_/);

        const snap = await pollUntilTerminal(created.jobId);
        expect(snap?.status).toBe('COMPLETED');
        expect(snap?.result?.summary.totalCases).toBe(5);
        expect(snap?.progress.percent).toBe(100);
        expect(snap?.completedAt).toBeGreaterThan(0);

        // The progress callback + a cancel signal were forwarded to the generation service.
        expect(typeof receivedOpts?.onProgress).toBe('function');
        expect(receivedOpts?.signal).toEqual({ cancelled: false });
    });

    test('runJob settles FAILED (with the error message) when generation throws', async () => {
        jest.mocked(testGenerationService.generateTestCases).mockRejectedValue(new Error('AI provider down'));

        const created = await generationJobService.createJob({ userStory: 'As a user I want to log in' });
        const snap = await pollUntilTerminal(created.jobId);

        expect(snap?.status).toBe('FAILED');
        expect(snap?.error).toContain('AI provider down');
        expect(snap?.result).toBeUndefined();
    });

    test('getJob returns null for an unknown / expired job id', async () => {
        expect(await generationJobService.getJob('job_does_not_exist')).toBeNull();
    });

    test('subscribe receives live progress + terminal snapshots broadcast by runJob (Phase 7 SSE)', async () => {
        // Hold generation pending so we can subscribe mid-flight, then drive it to completion.
        let resolveGen: (val: TestGenerationResponse) => void = () => undefined;
        const genPromise = new Promise<TestGenerationResponse>((resolve) => {
            resolveGen = resolve;
        });
        let capturedOpts: OrchestratorOptions | undefined;
        jest.mocked(testGenerationService.generateTestCases).mockImplementation(async (_input, opts) => {
            capturedOpts = opts;
            return genPromise;
        });

        const created = await generationJobService.createJob({ userStory: 'As a user I want to export data' });

        // Wait until runJob has reached the pending generation call (status === PROCESSING), which
        // means the mock was invoked and `capturedOpts` is populated.
        let snap = await generationJobService.getJob(created.jobId);
        for (let i = 0; i < 50 && snap?.status !== 'PROCESSING'; i++) {
            await new Promise((r) => setTimeout(r, 10));
            snap = await generationJobService.getJob(created.jobId);
        }
        expect(snap?.status).toBe('PROCESSING');

        const received: GenerationJobSnapshot[] = [];
        const unsubscribe = generationJobService.subscribe(created.jobId, (s) => received.push(s));

        // 1) Orchestrator emits progress → broadcast reaches the subscriber.
        capturedOpts?.onProgress?.({ percent: 25, currentPhase: 'functional-generation', phases: [] });
        // 2) Resolve generation → runJob broadcasts the COMPLETED terminal snapshot.
        resolveGen(fixtureResult());

        const terminal = await pollUntilTerminal(created.jobId);
        unsubscribe();

        expect(terminal?.status).toBe('COMPLETED');
        expect(received.some((s) => s.progress.percent === 25)).toBe(true);
        expect(received.some((s) => s.status === 'COMPLETED' && s.result?.summary.totalCases === 5)).toBe(true);
    });

    test('getMetrics tracks created + completed jobs (Phase 8 measure-first)', async () => {
        jest.mocked(testGenerationService.generateTestCases).mockResolvedValue(fixtureResult());

        const before = generationJobService.getMetrics();
        const created = await generationJobService.createJob({ userStory: 'As a user I want metrics' });
        expect(generationJobService.getMetrics().totalCreated).toBe(before.totalCreated + 1);

        const terminal = await pollUntilTerminal(created.jobId);
        expect(terminal?.status).toBe('COMPLETED');

        const after = generationJobService.getMetrics();
        expect(after.completed).toBe(before.completed + 1);
        // Settled → active concurrency not above the pre-test baseline.
        expect(after.activeJobs).toBeLessThanOrEqual(before.activeJobs);
    });
});
