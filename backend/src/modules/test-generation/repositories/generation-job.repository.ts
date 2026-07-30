/**
 * Generation Job Repository — in-memory store for Phase 6 (job-based processing).
 *
 * Mirrors the existing in-memory repository pattern (e.g. bug.repository.ts): a Map + async CRUD +
 * a singleton default export. Phase 8 swaps this for Redis; the interface stays the same. Jobs are
 * evicted by TTL (terminal jobs expire) + a hard cap so memory stays bounded.
 */

import crypto from 'crypto';
import logger from '../../../shared/logger';
import { buildGenerationProgress } from '../../../shared/constants';
import type { GenerationJob, GenerationJobSnapshot, TestCaseInput } from '../../../shared/types';

const MAX_ENTRIES = 200;
/** Time-to-live for a terminal job (COMPLETED/FAILED/CANCELLED) before eviction. */
const COMPLETED_TTL_MS = 30 * 60 * 1000; // 30 minutes

class GenerationJobRepository {
    private jobs = new Map<string, GenerationJob>();

    async create(input: TestCaseInput): Promise<GenerationJob> {
        const id = `job_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        const job: GenerationJob = {
            id,
            status: 'QUEUED',
            input,
            progress: buildGenerationProgress('requirement-processing'),
            startedAt: Date.now(),
            cancelRequested: false,
            version: 1,
        };
        this.evictIfFull();
        this.jobs.set(id, job);
        logger.info(`Generation job created: ${id}`);
        return job;
    }

    async getById(id: string): Promise<GenerationJob | undefined> {
        this.evictExpired();
        return this.jobs.get(id);
    }

    /** Apply a partial update (bumps version for optimistic-concurrency readiness). */
    async update(id: string, patch: Partial<GenerationJob>): Promise<GenerationJob | undefined> {
        const existing = this.jobs.get(id);
        if (!existing) return undefined;
        const updated: GenerationJob = { ...existing, ...patch, version: existing.version + 1 };
        this.jobs.set(id, updated);
        return updated;
    }

    /** Mark cancel-requested on a non-terminal job; the orchestrator checks it between phases. */
    async requestCancel(id: string): Promise<GenerationJob | undefined> {
        const existing = this.jobs.get(id);
        if (!existing) return undefined;
        const terminal =
            existing.status === 'COMPLETED' || existing.status === 'FAILED' || existing.status === 'CANCELLED';
        if (terminal) return existing; // no-op once terminal
        const updated: GenerationJob = { ...existing, cancelRequested: true, version: existing.version + 1 };
        this.jobs.set(id, updated);
        return updated;
    }

    /** Project a job to its polling snapshot (drops the input snapshot + internal flags). */
    toSnapshot(job: GenerationJob): GenerationJobSnapshot {
        return {
            id: job.id,
            status: job.status,
            progress: job.progress,
            result: job.result,
            error: job.error,
            startedAt: job.startedAt,
            completedAt: job.completedAt,
        };
    }

    private evictIfFull(): void {
        this.evictExpired();
        if (this.jobs.size < MAX_ENTRIES) return;
        // Still full — drop the oldest by startedAt.
        let oldestId: string | null = null;
        let oldestTime = Infinity;
        for (const [id, job] of this.jobs) {
            if (job.startedAt < oldestTime) {
                oldestTime = job.startedAt;
                oldestId = id;
            }
        }
        if (oldestId) {
            this.jobs.delete(oldestId);
            logger.warn(`Generation job evicted (cap reached): ${oldestId}`);
        }
    }

    private evictExpired(): void {
        const now = Date.now();
        for (const [id, job] of this.jobs) {
            const terminal =
                job.status === 'COMPLETED' || job.status === 'FAILED' || job.status === 'CANCELLED';
            if (terminal && job.completedAt && now - job.completedAt > COMPLETED_TTL_MS) {
                this.jobs.delete(id);
            }
        }
    }
}

export default new GenerationJobRepository();
