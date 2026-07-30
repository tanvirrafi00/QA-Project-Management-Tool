/**
 * Frontend performance measurement utility for the Test Case Generator.
 *
 * Phase 1 instrumentation — captures the client-side portion of the generation
 * journey so it can be compared against the backend `timings` and the real
 * bottleneck (network vs. render vs. AI) can be identified.
 *
 * All measurements are best-effort and console-only (no telemetry). They use the
 * High-Resolution Time API (`performance.now()`) for sub-millisecond accuracy.
 */

export interface FrontendTimings {
    /** ms from "Generate" click to the fetch being dispatched. */
    clickTime: number;
    /** ms spent waiting on the API (network + backend). */
    apiWaitTime: number;
    /** ms from result state set to the next paint (perceived render). */
    renderTime: number;
    /** ms to render the test-case table (largest list). */
    tableRenderTime: number;
}

class PerfTracker {
    private marks = new Map<string, number>();
    private startedAt = performance.now();

    mark(label: string): void {
        this.marks.set(label, performance.now());
    }

    /** Duration between two marks (or from tracker start if `from` is null). */
    between(from: string | null, to: string): number {
        const start = from ? this.marks.get(from) : this.startedAt;
        const end = this.marks.get(to);
        if (start == null || end == null) return 0;
        return Math.round(end - start);
    }

    /** ms elapsed since a mark was set (for "mark now, read later" patterns). */
    elapsedSince(mark: string): number {
        const start = this.marks.get(mark);
        if (start == null) return 0;
        return Math.round(performance.now() - start);
    }

    reset(): void {
        this.marks.clear();
        this.startedAt = performance.now();
    }
}

export const perf = new PerfTracker();
export default perf;

/**
 * Log a completed generation's client-side timings alongside the backend timings
 * (when available) so the two can be compared in the browser console.
 */
export function logFrontendTimings(
    fe: FrontendTimings,
    backend?: { totalMs?: number; aiTotalMs?: number; cacheHit?: boolean },
): void {
    // eslint-disable-next-line no-console
    console.info('[perf] test-case generation', {
        clickMs: fe.clickTime,
        apiWaitMs: fe.apiWaitTime,
        renderMs: fe.renderTime,
        tableRenderMs: fe.tableRenderTime,
        backendTotalMs: backend?.totalMs,
        backendAiMs: backend?.aiTotalMs,
        cacheHit: backend?.cacheHit,
    });
}
