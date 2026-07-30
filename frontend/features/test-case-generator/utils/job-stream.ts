'use client';

/**
 * Phase 7 — stream a generation job's live progress.
 *
 * Primary transport: SSE via EventSource (`GET /api/generation-jobs/:id/events`), which the browser
 * auto-reconnects and authenticates via the httpOnly cookie. If EventSource can't connect or errors
 * (proxy buffering, network drop, unsupported runtime), it transparently falls back to the Phase 6
 * poll loop — so the UI never stalls on a transport hiccup.
 *
 * Resolves with the terminal snapshot (COMPLETED/FAILED/CANCELLED), or rejects if the job can't be
 * reached after repeated polling failures.
 */

import { testCaseGeneratorService } from '../services/test-case-generator.service';
import type { GenerationJobSnapshot } from '../types';

const isTerminal = (s: GenerationJobSnapshot) =>
    s.status === 'COMPLETED' || s.status === 'FAILED' || s.status === 'CANCELLED';

const POLL_INTERVAL_MS = 700;
/** Consecutive poll failures before we give up (≈7s). */
const MAX_POLL_FAILURES = 10;

export function streamGenerationJob(
    jobId: string,
    onSnapshot: (snapshot: GenerationJobSnapshot) => void,
): Promise<GenerationJobSnapshot> {
    return new Promise<GenerationJobSnapshot>((resolve, reject) => {
        let settled = false;
        let es: EventSource | null = null;
        let pollTimer: ReturnType<typeof setInterval> | null = null;
        let pollFailures = 0;

        const cleanup = () => {
            if (es) {
                es.close();
                es = null;
            }
            if (pollTimer) {
                clearInterval(pollTimer);
                pollTimer = null;
            }
        };
        const finish = (snapshot: GenerationJobSnapshot) => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve(snapshot);
        };
        const fail = (message: string) => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(new Error(message));
        };

        const startPolling = () => {
            if (pollTimer) return;
            const tick = async () => {
                const res = await testCaseGeneratorService.getGenerationJob(jobId);
                if (settled) return;
                if (res.success && res.data) {
                    pollFailures = 0;
                    onSnapshot(res.data);
                    if (isTerminal(res.data)) finish(res.data);
                } else {
                    pollFailures += 1;
                    if (pollFailures >= MAX_POLL_FAILURES) {
                        fail(res.error || 'Unable to reach the generation job. Please try again.');
                    }
                }
            };
            void tick();
            pollTimer = setInterval(() => {
                void tick();
            }, POLL_INTERVAL_MS);
        };

        // SSE primary.
        try {
            es = new EventSource(`/api/generation-jobs/${encodeURIComponent(jobId)}/events`);
            es.onmessage = (event) => {
                try {
                    const snapshot = JSON.parse(event.data) as GenerationJobSnapshot;
                    pollFailures = 0;
                    onSnapshot(snapshot);
                    if (isTerminal(snapshot)) finish(snapshot);
                } catch {
                    /* ignore a malformed chunk */
                }
            };
            es.onerror = () => {
                if (settled) return;
                // SSE dropped or errored — switch to polling (which also rides the proxy's 401-refresh).
                if (es) {
                    es.close();
                    es = null;
                }
                startPolling();
            };
        } catch {
            // EventSource unavailable (e.g. SSR/unsupported) — fall back to polling immediately.
            startPolling();
        }
    });
}
