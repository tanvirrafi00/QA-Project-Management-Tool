/**
 * Phase-aware progress calibration (Phase 5 — perceived-performance UX).
 *
 * The backend is synchronous: it returns `timings.phases` + `strategy.phases` only when generation
 * COMPLETES. So during the wait we can't show live backend state (true real-time is SSE in Phase 7 /
 * job-polling in Phase 6 — deliberately out of scope here). Instead we show a CALIBRATED progression:
 * the step names are the REAL backend phase names, and their pacing is learned from the previous run's
 * `timings.phases`. The progress bar approaches but never reaches 100% until the real response arrives
 * — it never fakes completion.
 *
 * Pure helpers (no React) so the pacing math is unit-testable independently of the component.
 */

/** Ordered backend PerformanceTimer phase keys (the canonical functional-first sequence). */
export const PHASE_KEYS = [
    'requirement-processing',
    'functional-generation',
    'functional-expansion',
    'secondary-generation',
    'merge',
    'final-adjustment',
    'coverage',
    'formatting',
] as const;

export type PhaseKey = (typeof PHASE_KEYS)[number];

/** Relative weight of each phase when no calibration exists yet (functional + secondary dominate). */
export const DEFAULT_WEIGHTS: Record<PhaseKey, number> = {
    'requirement-processing': 1,
    'functional-generation': 4,
    'functional-expansion': 1.5,
    'secondary-generation': 3,
    merge: 0.5,
    'final-adjustment': 0.5,
    coverage: 0.4,
    formatting: 0.2,
};

/** Progress is capped here while waiting — never visually "done" until the real result lands. */
export const PROGRESS_CEILING = 90;

/** Fallback total-duration estimate (ms) before the first calibrated run. */
export const DEFAULT_ESTIMATED_TOTAL_MS = 9000;

const CALIBRATION_KEY = 'tcg:phase-calibration:v1';

export interface PhaseCalibration {
    /** Per-phase ms observed on the last completed generation. */
    phases: Partial<Record<PhaseKey, number>>;
    /** Total ms of the last completed generation. */
    totalMs: number;
    updatedAt: number;
}

export interface PhaseBand {
    key: PhaseKey;
    /** Start progress % (cumulative, 0..PROGRESS_CEILING). */
    startPct: number;
    /** End progress % (cumulative, 0..PROGRESS_CEILING). */
    endPct: number;
}

/** Clamp an observed total into a believable estimate window (3s..2min) — guards outliers. */
export function clampEstimatedTotal(ms: number | undefined): number {
    if (!ms || ms <= 0) return DEFAULT_ESTIMATED_TOTAL_MS;
    return Math.min(Math.max(ms, 3000), 120_000);
}

/**
 * Read the last-saved calibration. Defensive against SSR / disabled storage / corrupt JSON.
 * Returns null when unavailable (caller falls back to DEFAULT weights + estimate).
 */
export function getCalibration(): PhaseCalibration | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem(CALIBRATION_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as PhaseCalibration;
        if (!parsed || typeof parsed.totalMs !== 'number' || !parsed.phases) return null;
        return parsed;
    } catch {
        return null;
    }
}

/** Persist the observed timings so the next run's progress is paced realistically. Best-effort. */
export function saveCalibration(phases: Record<string, number>, totalMs: number): void {
    if (typeof window === 'undefined') return;
    if (!totalMs || totalMs <= 0) return;
    try {
        // Keep only the known phase keys (drops the granular per-call `ai` entry the timer also emits).
        const filtered: Partial<Record<PhaseKey, number>> = {};
        for (const k of PHASE_KEYS) {
            if (typeof phases[k] === 'number') filtered[k] = phases[k]!;
        }
        const entry: PhaseCalibration = { phases: filtered, totalMs, updatedAt: Date.now() };
        window.localStorage.setItem(CALIBRATION_KEY, JSON.stringify(entry));
    } catch {
        /* storage full / blocked — calibration is best-effort, ignore */
    }
}

/**
 * Build cumulative progress bands (0..PROGRESS_CEILING) for the phases to display. Weights come from
 * the calibration when available (real observed ms), else DEFAULT_WEIGHTS. Secondary-only phases are
 * dropped when `hasSecondary` is false so the UI never promises a step that won't run.
 */
export function buildPhaseBands(
    calibration: PhaseCalibration | null,
    hasSecondary: boolean,
): PhaseBand[] {
    const keys = PHASE_KEYS.filter(
        (k) => hasSecondary || (k !== 'secondary-generation' && k !== 'final-adjustment'),
    );
    const weightOf = (k: PhaseKey): number => {
        const observed = calibration?.phases[k];
        if (typeof observed === 'number' && observed > 0) return observed;
        return DEFAULT_WEIGHTS[k] ?? 1;
    };
    const total = keys.reduce((sum, k) => sum + weightOf(k), 0) || 1;
    const bands: PhaseBand[] = [];
    let cumulative = 0;
    for (const k of keys) {
        const share = (weightOf(k) / total) * PROGRESS_CEILING;
        bands.push({ key: k, startPct: cumulative, endPct: cumulative + share });
        cumulative += share;
    }
    return bands;
}

/**
 * Eased progress: approaches PROGRESS_CEILING asymptotically, so it NEVER reaches 100% on its own
 * (the real result snapping the screen away is what "completes" it). Robust to a wrong total
 * estimate — if the request outlasts the estimate, the bar simply rests near the ceiling instead of
 * stalling at a fake 100%. Returns an integer 0..PROGRESS_CEILING.
 */
export function easeProgress(elapsedMs: number, estimatedTotalMs: number): number {
    if (elapsedMs <= 0) return 0;
    const tau = Math.max(estimatedTotalMs / 3, 1);
    const pct = PROGRESS_CEILING * (1 - Math.exp(-elapsedMs / tau));
    return Math.min(Math.round(pct), PROGRESS_CEILING);
}

/** Which phase band a given progress % currently falls within (last band when at the ceiling). */
export function phaseIndexForProgress(bands: PhaseBand[], progress: number): number {
    const idx = bands.findIndex((b) => progress < b.endPct - 0.01);
    return idx === -1 ? bands.length - 1 : idx;
}
