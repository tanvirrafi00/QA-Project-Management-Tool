/**
 * Generation Job Service — Phase 6 (job-based) + Phase 7 (live progress via SSE).
 *
 * Decouples the HTTP request from generation: `createJob` persists a QUEUED job and kicks off
 * `runJob` WITHOUT awaiting, so the request returns `{ jobId, status }` immediately. `runJob` drives
 * the orchestrator with a progress callback + cancel signal, updating the job store at each phase,
 * and settles the job COMPLETED / FAILED / CANCELLED.
 *
 * Phase 7: every progress + terminal update is also `broadcast` on a per-job `EventEmitter`, so the
 * SSE handler (`GET /api/generation-jobs/:id/events`) can push live snapshots to subscribed clients
 * instead of being polled. The actual generation reuses `testGenerationService.generateTestCases`
 * (single path for AI-provenance recording + error wrapping) — we forward the Phase 6 `opts`
 * (progress + signal) through it.
 */

import { EventEmitter } from 'events';
import generationJobRepository from '../repositories/generation-job.repository';
import testGenerationService from './test-generation.service';
import { JobCancelledError } from '../../../shared/errors';
import { buildGenerationProgress } from '../../../shared/constants';
import logger from '../../../shared/logger';
import type {
    GenerationJob,
    GenerationJobSnapshot,
    GenerationJobStatus,
    GenerationProgress,
    TestCaseInput,
} from '../../../shared/types';

/** Concurrency counters for the in-memory job model (Phase 8 — measure-first; see ADR-011). */
export interface GenerationJobMetrics {
    /** Jobs currently running (fire-and-forget, not yet terminal). */
    activeJobs: number;
    /** High-water mark of concurrent jobs since process start. */
    peakActiveJobs: number;
    /** Total jobs ever created in this process. */
    totalCreated: number;
    /** Terminal counters since process start. */
    completed: number;
    failed: number;
    cancelled: number;
}

class GenerationJobService {
    /** Transient cancel signals for in-flight jobs (in-process; Redis in Phase 8). */
    private activeSignals = new Map<string, { cancelled: boolean }>();
    /** Per-job progress broadcaster (Phase 7 SSE). Channel name: `progress:<jobId>`. */
    private events = new EventEmitter();
    /**
     * Concurrency counters (Phase 8 — measure-first). The single most decision-relevant signal for
     * whether the in-memory model needs Redis/queue workers is how many jobs run at once. Nothing else
     * records this; these counters make it observable (see `getMetrics` + ADR-011).
     */
    private metrics: GenerationJobMetrics = {
        activeJobs: 0,
        peakActiveJobs: 0,
        totalCreated: 0,
        completed: 0,
        failed: 0,
        cancelled: 0,
    };

    /** Validate, persist a QUEUED job, start generation in the background, return immediately. */
    async createJob(input: TestCaseInput): Promise<{ jobId: string; status: GenerationJobStatus }> {
        const job = await generationJobRepository.create(input);
        const signal = { cancelled: false };
        this.activeSignals.set(job.id, signal);

        // Phase 8 measure-first: track concurrency. A rising peak is the signal that the single
        // in-memory instance is stacking up work — the trigger to re-evaluate Redis/queue workers.
        this.metrics.totalCreated++;
        this.metrics.activeJobs++;
        if (this.metrics.activeJobs > this.metrics.peakActiveJobs) {
            this.metrics.peakActiveJobs = this.metrics.activeJobs;
            logger.info('🧭 Generation concurrency peak', {
                peak: this.metrics.peakActiveJobs,
                active: this.metrics.activeJobs,
            });
        }

        // Fire-and-forget. The orchestrator is async/I/O-bound on AI calls, so the Node event loop
        // advances it without blocking the request thread. All outcomes are captured in runJob.
        void this.runJob(job.id, input, signal)
            .catch((err) => logger.error(`Generation job ${job.id} crashed unexpectedly`, err))
            .finally(() => this.activeSignals.delete(job.id));

        return { jobId: job.id, status: job.status };
    }

    /** Poll a job's status + progress (+ result when COMPLETED). Null if unknown/expired. */
    async getJob(jobId: string): Promise<GenerationJobSnapshot | null> {
        const job = await generationJobRepository.getById(jobId);
        if (!job) return null;
        return generationJobRepository.toSnapshot(job);
    }

    /** Request cancellation of an in-flight job (best-effort, between phases). No-op if terminal. */
    async cancelJob(jobId: string): Promise<GenerationJobSnapshot | null> {
        const signal = this.activeSignals.get(jobId);
        if (signal) signal.cancelled = true;
        const job = await generationJobRepository.requestCancel(jobId);
        if (!job) return null;
        return generationJobRepository.toSnapshot(job);
    }

    /**
     * Subscribe to LIVE updates for a job (Phase 7 SSE). The callback receives a snapshot on every
     * progress + terminal update until the job settles. Returns an unsubscribe function — the SSE
     * handler MUST call it on client disconnect to avoid listener leaks.
     */
    subscribe(jobId: string, onSnapshot: (snapshot: GenerationJobSnapshot) => void): () => void {
        const channel = `progress:${jobId}`;
        this.events.on(channel, onSnapshot);
        return () => this.events.off(channel, onSnapshot);
    }

    /** Broadcast a snapshot to all subscribers of a job (no-op if none). */
    private broadcast(job: GenerationJob): void {
        this.events.emit(`progress:${job.id}`, generationJobRepository.toSnapshot(job));
    }

    /** Snapshot of the concurrency counters (Phase 8 measure-first). */
    getMetrics(): GenerationJobMetrics {
        return { ...this.metrics };
    }

    private async runJob(
        jobId: string,
        input: TestCaseInput,
        signal: { cancelled: boolean },
    ): Promise<void> {
        const onProgress = (progress: GenerationProgress): void => {
            void generationJobRepository.update(jobId, { progress }).then((updated) => {
                if (updated) this.broadcast(updated);
            });
        };

        try {
            const processing = await generationJobRepository.update(jobId, { status: 'PROCESSING' });
            if (processing) this.broadcast(processing);
            const result = await testGenerationService.generateTestCases(input, { onProgress, signal });
            const completed = await generationJobRepository.update(jobId, {
                status: 'COMPLETED',
                result,
                progress: buildGenerationProgress(null, true),
                completedAt: Date.now(),
            });
            if (completed) this.broadcast(completed);
            this.metrics.completed++;
            logger.info(`Generation job ${jobId} COMPLETED — ${result.summary.totalCases} cases`);
        } catch (error: any) {
            if (error instanceof JobCancelledError) {
                const cancelled = await generationJobRepository.update(jobId, {
                    status: 'CANCELLED',
                    completedAt: Date.now(),
                    progress: buildGenerationProgress(null, true),
                });
                if (cancelled) this.broadcast(cancelled);
                this.metrics.cancelled++;
                logger.info(`Generation job ${jobId} CANCELLED`);
                return;
            }
            const failed = await generationJobRepository.update(jobId, {
                status: 'FAILED',
                error: error.message || 'Failed to generate test cases',
                completedAt: Date.now(),
            });
            if (failed) this.broadcast(failed);
            this.metrics.failed++;
            logger.error(`Generation job ${jobId} FAILED`, error);
        } finally {
            // Decrement active concurrency on every exit (success, cancel, fail, or throw).
            this.metrics.activeJobs = Math.max(0, this.metrics.activeJobs - 1);
        }
    }
}

export default new GenerationJobService();
