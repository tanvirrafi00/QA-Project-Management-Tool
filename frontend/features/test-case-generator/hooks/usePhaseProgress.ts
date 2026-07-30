'use client';

/**
 * usePhaseProgress — drives the Phase 5 processing screen.
 *
 * On activation it reads the last run's calibration, builds the real backend phase bands, and eases
 * progress toward the ceiling via requestAnimationFrame. Honest by construction: progress never
 * reaches 100% on its own (see `easeProgress`); the real response landing + the screen unmounting
 * is what completes the perceived journey.
 */

import { useEffect, useRef, useState } from 'react';
import {
    buildPhaseBands,
    clampEstimatedTotal,
    easeProgress,
    getCalibration,
    phaseIndexForProgress,
    type PhaseBand,
} from '../utils/phase-progress';

export interface UsePhaseProgressResult {
    /** The phase bands being displayed (real backend phase keys, in order). */
    bands: PhaseBand[];
    /** Current eased progress %, integer 0..90. */
    percent: number;
    /** Index into `bands` of the currently-active phase. */
    phaseIndex: number;
}

export function usePhaseProgress(active: boolean, hasSecondary: boolean): UsePhaseProgressResult {
    const [percent, setPercent] = useState(0);
    const startRef = useRef<number | null>(null);

    // Bands + the estimated total are derived from calibration ONCE per mount (the screen mounts
    // fresh for each generation, so reading at mount captures the latest calibration + the form's
    // hasSecondary at click time).
    const [bands] = useState<PhaseBand[]>(() => buildPhaseBands(getCalibration(), hasSecondary));
    const estimatedTotalRef = useRef(clampEstimatedTotal(getCalibration()?.totalMs));

    useEffect(() => {
        if (!active) {
            startRef.current = null;
            setPercent(0);
            return;
        }
        startRef.current = performance.now();
        let raf = 0;
        const tick = () => {
            const start = startRef.current ?? performance.now();
            const elapsed = performance.now() - start;
            const next = easeProgress(elapsed, estimatedTotalRef.current);
            // Only re-render when the integer percent actually changes (~90 steps over the whole run,
            // not 60/second).
            setPercent((prev) => (prev === next ? prev : next));
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [active]);

    return { bands, percent, phaseIndex: phaseIndexForProgress(bands, percent) };
}
