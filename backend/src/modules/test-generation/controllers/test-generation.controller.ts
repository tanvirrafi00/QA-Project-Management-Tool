/**
 * Test Generation Controller
 * HTTP handler - validates input, calls service, formats response
 *
 * NOTE: Generated test cases are NOT auto-saved. The user reviews them in
 * Step 3 of the wizard and manually clicks "Save to Repository" to persist.
 * The save is handled by the test-case-management bulk-save endpoint.
 */

import { NextFunction, Request, Response } from 'express';
import testGenerationService from '../services/test-generation.service';
import generationJobService from '../services/generation-job.service';
import { GenerateTestCaseDto } from '../dto/generate-testcase.dto';
import logger from '../../../shared/logger';
import { sendSuccess } from '../../../shared/http/responses';
import { NotFoundError } from '../../../shared/errors';
import { TEST_TYPE_OPTIONS, COVERAGE_LEVEL_OPTIONS, GENERATION_MODULES, CUSTOM_MODULE } from '../../../shared/constants';
import type { GenerationJobSnapshot } from '../../../shared/types';

export const testGenerationController = {
    /**
     * POST /api/generate/test-cases
     * Generate comprehensive test cases using multi-agent AI system.
     * Does NOT auto-save — user reviews and saves manually from the UI.
     */
    async generateTestCases(req: Request, res: Response, next: NextFunction) {
        try {
            // Validate and transform input
            const input = GenerateTestCaseDto.fromRequest(req.body);

            logger.info('POST /api/generate/test-cases', {
                project: input.projectName,
                module: input.module,
                feature: input.featureName,
                minTestCases: input.minTestCases,
                coverageLevel: input.coverageLevel,
                testTypes: input.testTypes?.length,
            });

            // Generate test cases via multi-agent AI
            const result = await testGenerationService.generateTestCases(input);

            logger.info('Test generation complete', {
                totalCases: result.summary.totalCases,
                coverage: result.coverage.score,
            });

            // Phase 2 — standard response `meta`. Reuses the Phase 1 `timings` as the single source
            // for processing time (no double-measurement); `cached` tracks cache hits (near-zero
            // processingTime). Returned to the client alongside the data envelope.
            const meta = {
                processingTime: result.timings?.totalMs ?? 0,
                generatedCount: result.summary?.totalCases ?? 0,
                cached: result.timings?.cacheHit === true,
            };

            // Return generated cases — NO auto-save. The frontend calls /api/test-cases/bulk-save
            // when the user approves.
            sendSuccess(res, result, meta);
        } catch (error) {
            // Defer to the global error handler, which maps AppError subclasses (incl. ValidationError
            // and AIError) to the correct status and the standard `{ success:false, error }` envelope.
            next(error);
        }
    },

    /**
     * POST /api/generate/test-cases/async — Phase 6 (job-based). Validate, create a generation job,
     * and return immediately with `{ jobId, status }`. Generation runs in the background; poll
     * `GET /api/generation-jobs/:id` for progress + result. The synchronous `POST /test-cases`
     * above is retained for direct/backward-compatible use.
     */
    async createGenerationJob(req: Request, res: Response, next: NextFunction) {
        try {
            const input = GenerateTestCaseDto.fromRequest(req.body);
            logger.info('POST /api/generate/test-cases/async', {
                project: input.projectName,
                module: input.module,
                feature: input.featureName,
                minTestCases: input.minTestCases,
                coverageLevel: input.coverageLevel,
                testTypes: input.testTypes?.length,
            });
            const job = await generationJobService.createJob(input);
            sendSuccess(res, job);
        } catch (error) {
            next(error);
        }
    },

    /**
     * GET /api/generation-jobs/:id — poll a job: status + progress, plus the full result when
     * COMPLETED (and the error message when FAILED).
     */
    async getGenerationJob(req: Request, res: Response, next: NextFunction) {
        try {
            const snapshot = await generationJobService.getJob(String(req.params.id));
            if (!snapshot) throw new NotFoundError('Generation job not found or expired');
            const meta = snapshot.result
                ? { generatedCount: snapshot.result.summary?.totalCases ?? 0, completed: true }
                : { progress: snapshot.progress.percent, currentPhase: snapshot.progress.currentPhase };
            sendSuccess(res, snapshot, meta);
        } catch (error) {
            next(error);
        }
    },

    /**
     * POST /api/generation-jobs/:id/cancel — request cancellation of an in-flight job. Best-effort:
     * the orchestrator stops at the next phase boundary. No-op if the job is already terminal.
     */
    async cancelGenerationJob(req: Request, res: Response, next: NextFunction) {
        try {
            const snapshot = await generationJobService.cancelJob(String(req.params.id));
            if (!snapshot) throw new NotFoundError('Generation job not found or expired');
            sendSuccess(res, snapshot);
        } catch (error) {
            next(error);
        }
    },

    /**
     * GET /api/generation-jobs/:id/events — Phase 7 SSE stream of live job snapshots. Sends the
     * current snapshot immediately, then pushes an update on every progress + terminal change until
     * the job settles; closes on terminal status or client disconnect. Falls back to the polling
     * endpoint (`GET /:id`) on the client if EventSource can't connect.
     */
    async streamGenerationJob(req: Request, res: Response) {
        const id = String(req.params.id);
        const snapshot = await generationJobService.getJob(id);
        if (!snapshot) {
            res.status(404).json({ success: false, message: 'Generation job not found or expired' });
            return;
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no'); // defeat intermediary proxy buffering

        const isTerminal = (s: GenerationJobSnapshot) =>
            s.status === 'COMPLETED' || s.status === 'FAILED' || s.status === 'CANCELLED';
        const writeEvent = (s: GenerationJobSnapshot) => {
            res.write(`data: ${JSON.stringify(s)}\n\n`);
        };

        // Send the current state immediately (the client may connect mid-run).
        writeEvent(snapshot);
        if (isTerminal(snapshot)) {
            res.end();
            return;
        }

        let closed = false;
        const cleanup = () => {
            if (closed) return;
            closed = true;
            clearInterval(heartbeat);
            unsubscribe();
        };
        const unsubscribe = generationJobService.subscribe(id, (s) => {
            if (closed) return;
            writeEvent(s);
            if (isTerminal(s)) {
                cleanup();
                res.end();
            }
        });
        // Heartbeat — keeps the stream alive through proxies that close idle connections.
        const heartbeat = setInterval(() => {
            if (!closed) res.write(': ping\n\n');
        }, 15000);

        // Client disconnected — stop listening so the emitter doesn't leak this connection.
        req.on('close', cleanup);
    },

    /**
     * GET /api/generation-jobs/metrics — Phase 8 measure-first. Concurrency counters for the in-memory
     * job model (active / peak / total + terminal counts). This is the observable signal for when
     * Redis/queue workers are warranted — see ADR-011. Process-scoped (resets on restart).
     */
    async getJobMetrics(_req: Request, res: Response) {
        sendSuccess(res, generationJobService.getMetrics());
    },

    /**
     * GET /api/generate/config — generation options for the input form (test types, coverage levels,
     * modules). The dropdowns populate from this so adding a type/module on the backend flows into
     * the UI automatically — no hardcoded lists in the page.
     */
    getConfig(_req: Request, res: Response) {
        sendSuccess(res, {
            testTypes: TEST_TYPE_OPTIONS,
            coverageLevels: COVERAGE_LEVEL_OPTIONS,
            modules: GENERATION_MODULES,
            customModule: CUSTOM_MODULE,
        });
    },

    /**
     * GET /api/health
     * Health check endpoint
     */
    healthCheck(req: Request, res: Response) {
        res.json({
            status: 'ok',
            service: 'AI QA Copilot Backend',
            version: '2.0.0',
            timestamp: new Date().toISOString(),
        });
    },
};
