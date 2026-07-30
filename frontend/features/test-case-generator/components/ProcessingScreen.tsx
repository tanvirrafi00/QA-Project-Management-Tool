'use client';

/**
 * ProcessingScreen - Full-page animated processing screen (Step 2 of wizard).
 *
 * Phase 6: when a live job `snapshot` is available, the phase list + progress % are driven by REAL
 * backend phase state (polled per-phase progress). Without a snapshot it falls back to the Phase 5
 * calibrated simulation (eased toward 90%, never faking 100%). Either way the step names are the
 * real backend phase names.
 */

import {
    Brain,
    Check,
    GitBranch,
    Layers,
    ListChecks,
    Loader2,
    Shield,
    SlidersHorizontal,
    Sparkles,
    Target,
} from 'lucide-react';
import { usePhaseProgress } from '../hooks/usePhaseProgress';
import type { PhaseKey } from '../utils/phase-progress';
import type { GenerationJobSnapshot } from '../types';

type PhaseStatus = 'pending' | 'active' | 'complete';

/** UI metadata for each backend phase (label + description + icon), keyed by backend timing label. */
const PHASE_UI: Record<PhaseKey, { label: string; description: string; icon: typeof Brain }> = {
    'requirement-processing': {
        label: 'Analyzing Requirement',
        description: 'Parsing and understanding your requirement',
        icon: Brain,
    },
    'functional-generation': {
        label: 'Building Functional Coverage',
        description: 'Generating functional cases for every requirement',
        icon: Sparkles,
    },
    'functional-expansion': {
        label: 'Expanding Coverage',
        description: 'Closing requirement gaps and topping up the floor',
        icon: Layers,
    },
    'secondary-generation': {
        label: 'Generating Secondary Types',
        description: 'UI, validation, negative, boundary, security cases',
        icon: Shield,
    },
    merge: {
        label: 'Merging & Deduplicating',
        description: 'Combining and de-duplicating across all types',
        icon: GitBranch,
    },
    'final-adjustment': {
        label: 'Final Count Adjustment',
        description: 'Reaching the requested test-case count',
        icon: SlidersHorizontal,
    },
    coverage: {
        label: 'Validating Coverage',
        description: 'Scoring coverage against the requirement',
        icon: Target,
    },
    formatting: {
        label: 'Preparing Output',
        description: 'Grouping, sorting, and numbering test cases',
        icon: ListChecks,
    },
};

interface DisplayPhase {
    key: string;
    label: string;
    description: string;
    status: PhaseStatus;
}

export function ProcessingScreen({
    projectName,
    module,
    hasSecondary = true,
    snapshot = null,
    onCancel,
}: {
    projectName?: string;
    module?: string;
    /** False when the user selected functional-only — hides secondary steps in the simulation fallback. */
    hasSecondary?: boolean;
    /** Live job snapshot (Phase 6). When present, drives real progress; else the simulation runs. */
    snapshot?: GenerationJobSnapshot | null;
    /** When provided, renders a Cancel button that requests job cancellation. */
    onCancel?: () => void;
}) {
    // The simulation runs only when there's no real snapshot yet (the first poll hasn't landed).
    const sim = usePhaseProgress(!snapshot, hasSecondary);

    // Build the display list: real snapshot phases, else the simulation bands projected onto PHASE_UI.
    const phases: DisplayPhase[] = snapshot
        ? snapshot.progress.phases.map((p) => ({
              key: p.key,
              label: p.label,
              description: PHASE_UI[p.key as PhaseKey]?.description ?? '',
              status: p.status as PhaseStatus,
          }))
        : sim.bands.map((b, i) => ({
              key: b.key,
              label: PHASE_UI[b.key].label,
              description: PHASE_UI[b.key].description,
              status: (i < sim.phaseIndex ? 'complete' : i === sim.phaseIndex ? 'active' : 'pending') as PhaseStatus,
          }));

    const percent = snapshot ? snapshot.progress.percent : sim.percent;

    return (
        <div
            className="flex flex-col items-center justify-center"
            style={{ minHeight: 'calc(100vh - 120px)', padding: 'var(--spacing-8)' }}
        >
            {/* Central Animated Icon */}
            <div style={{ position: 'relative', marginBottom: '40px' }}>
                {/* Pulsing rings */}
                <div
                    style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: '120px',
                        height: '120px',
                        borderRadius: '50%',
                        border: '2px solid rgba(59, 130, 246, 0.2)',
                        animation: 'pulse-ring 2s ease-out infinite',
                    }}
                />
                <div
                    style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: '100px',
                        height: '100px',
                        borderRadius: '50%',
                        border: '2px solid rgba(59, 130, 246, 0.3)',
                        animation: 'pulse-ring 2s ease-out infinite 0.5s',
                    }}
                />
                {/* Center icon */}
                <div
                    style={{
                        width: '80px',
                        height: '80px',
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 8px 32px rgba(59, 130, 246, 0.3)',
                        position: 'relative',
                        zIndex: 1,
                    }}
                >
                    <Sparkles style={{ width: '36px', height: '36px', color: '#FFFFFF' }} />
                </div>
            </div>

            {/* Title */}
            <h2
                style={{
                    fontSize: '28px',
                    fontWeight: 700,
                    color: '#0F172A',
                    marginBottom: '8px',
                    letterSpacing: '-0.025em',
                }}
            >
                Generating Test Cases
            </h2>

            {/* Subtitle */}
            <p style={{ fontSize: '15px', color: '#64748B', marginBottom: '40px' }}>
                {projectName && module
                    ? `Project: ${projectName} · Module: ${module}`
                    : 'AI agents are analyzing your requirement...'}
            </p>

            {/* Phase list (real backend phase state when snapshot is present) */}
            <div
                style={{
                    width: '100%',
                    maxWidth: '520px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                }}
            >
                {phases.map((phase) => {
                    const isComplete = phase.status === 'complete';
                    const isActive = phase.status === 'active';
                    const isPending = phase.status === 'pending';
                    const Icon = PHASE_UI[phase.key as PhaseKey]?.icon ?? Sparkles;

                    return (
                        <div
                            key={phase.key}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '16px',
                                padding: '14px 20px',
                                borderRadius: '12px',
                                transition: 'all 0.3s ease',
                                background: isActive
                                    ? 'linear-gradient(90deg, rgba(59, 130, 246, 0.08) 0%, rgba(139, 92, 246, 0.04) 100%)'
                                    : 'transparent',
                                opacity: isPending ? 0.4 : 1,
                            }}
                        >
                            {/* Status Icon */}
                            <div
                                style={{
                                    width: '36px',
                                    height: '36px',
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0,
                                    transition: 'all 0.3s ease',
                                    background: isComplete
                                        ? '#10B981'
                                        : isActive
                                            ? 'linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%)'
                                            : '#F1F5F9',
                                }}
                            >
                                {isComplete ? (
                                    <Check style={{ width: '18px', height: '18px', color: '#FFFFFF' }} />
                                ) : isActive ? (
                                    <Loader2
                                        style={{
                                            width: '18px',
                                            height: '18px',
                                            color: '#FFFFFF',
                                            animation: 'spin 1s linear infinite',
                                        }}
                                    />
                                ) : (
                                    <Icon style={{ width: '16px', height: '16px', color: '#94A3B8' }} />
                                )}
                            </div>

                            {/* Label + Description */}
                            <div style={{ flex: 1 }}>
                                <div
                                    style={{
                                        fontSize: '15px',
                                        fontWeight: 600,
                                        color: isComplete || isActive ? '#0F172A' : '#94A3B8',
                                        transition: 'color 0.3s ease',
                                    }}
                                >
                                    {phase.label}
                                </div>
                                <div
                                    style={{
                                        fontSize: '13px',
                                        color: isComplete ? '#10B981' : isActive ? '#64748B' : '#CBD5E1',
                                        transition: 'color 0.3s ease',
                                    }}
                                >
                                    {isComplete ? 'Completed' : phase.description}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Progress bar */}
            <div
                style={{
                    width: '100%',
                    maxWidth: '520px',
                    marginTop: '32px',
                    height: '4px',
                    background: '#E2E8F0',
                    borderRadius: '2px',
                    overflow: 'hidden',
                }}
            >
                <div
                    style={{
                        width: `${percent}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg, #3B82F6 0%, #8B5CF6 100%)',
                        borderRadius: '2px',
                        transition: 'width 0.4s ease',
                    }}
                />
            </div>

            {/* Cancel (Phase 6) — best-effort; the job stops at the next phase boundary. */}
            {onCancel && (
                <button
                    type="button"
                    onClick={onCancel}
                    style={{
                        marginTop: '20px',
                        fontSize: '13px',
                        color: '#94A3B8',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        textDecoration: 'underline',
                    }}
                >
                    Cancel
                </button>
            )}

            {/* Inline styles for keyframes */}
            <style>{`
        @keyframes pulse-ring {
          0% { transform: translate(-50%, -50%) scale(0.8); opacity: 0.8; }
          100% { transform: translate(-50%, -50%) scale(1.8); opacity: 0; }
        }
      `}</style>
        </div>
    );
}
