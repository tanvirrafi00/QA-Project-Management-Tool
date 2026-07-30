/**
 * Performance Timer — lightweight, allocation-free timing for the generation pipeline.
 *
 * Phase 1 of the Test Case Generator Performance Optimization initiative. This is a measurement
 * primitive only: it records timestamps and computes durations. It has no side effects beyond
 * storing entries, so it is safe to use inside the (concurrent, singleton) orchestrator as long as
 * each `execute()` call creates its own instance and threads it through (never stored on `this`).
 *
 * Usage:
 *   const timer = new PerformanceTimer();
 *   await timer.track('requirement-processing', () => doWork());
 *   timer.measure('formatting', 'merge-end'); // from a prior mark to now
 *   const timings: GenerationTimings = timer.toTimings({ cacheHit: false });
 */

import type { GenerationTimings } from '../types';

/** A single measured duration. */
export interface TimingEntry {
    label: string;
    durationMs: number;
}

/** Label used for every individual AI provider call tracked by the timer. */
export const AI_CALL_LABEL = 'ai';

export class PerformanceTimer {
    private readonly startedAt = Date.now();
    private readonly marks = new Map<string, number>();
    private readonly entries: TimingEntry[] = [];

    /** Record a named timestamp marker (used as a boundary for `measure()`). */
    mark(label: string): void {
        this.marks.set(label, Date.now());
    }

    /**
     * Record a duration entry:
     *  - `measure(label)`                       → from timer start to now
     *  - `measure(label, fromMark)`             → from a prior mark to now
     *  - `measure(label, fromMark, toMark)`     → between two marks
     */
    measure(label: string, fromMark?: string, toMark?: string): TimingEntry {
        const end = toMark ? this.marks.get(toMark) ?? Date.now() : Date.now();
        const start = fromMark ? this.marks.get(fromMark) ?? this.startedAt : this.startedAt;
        const entry: TimingEntry = { label, durationMs: Math.max(0, end - start) };
        this.entries.push(entry);
        return entry;
    }

    /** Time an async block; always records an entry (even if it throws). */
    async track<T>(label: string, fn: () => Promise<T>): Promise<T> {
        const start = Date.now();
        try {
            return await fn();
        } finally {
            this.entries.push({ label, durationMs: Date.now() - start });
        }
    }

    /** Time a synchronous block. */
    trackSync<T>(label: string, fn: () => T): T {
        const start = Date.now();
        try {
            return fn();
        } finally {
            this.entries.push({ label, durationMs: Date.now() - start });
        }
    }

    /** All recorded entries (in insertion order). */
    getEntries(): readonly TimingEntry[] {
        return this.entries;
    }

    /** Total elapsed since the timer was created. */
    totalMs(): number {
        return Date.now() - this.startedAt;
    }

    /** Build the additive `GenerationTimings` payload for the response. */
    toTimings(opts: { cacheHit: boolean }): GenerationTimings {
        const aiEntries = this.entries.filter((e) => e.label === AI_CALL_LABEL);
        const phases: Record<string, number> = {};
        for (const e of this.entries) {
            if (e.label === AI_CALL_LABEL) continue; // AI calls are summarized below, not per-phase
            // Keep the last recorded value for a label (deterministic).
            phases[e.label] = e.durationMs;
        }
        return {
            totalMs: this.totalMs(),
            cacheHit: opts.cacheHit,
            phases,
            aiCalls: aiEntries.length,
            aiTotalMs: aiEntries.reduce((sum, e) => sum + e.durationMs, 0),
        };
    }
}

export default PerformanceTimer;
