/**
 * Estimation math — the SINGLE source of truth for every computed estimation metric.
 *
 * Reporting rule (docs/reporting-rules.md): metrics are computed server-side and live in exactly one
 * place. Repositories and the service call these pure functions; the frontend never recomputes.
 *
 * Pure & side-effect free → unit-testable in isolation. No I/O, no DB, no Date/random.
 *
 * Rounding policy:
 *   - hours / capacity / duration / risk score → 2 dp
 *   - utilization %                           → 1 dp
 *   - complexity score                        → integer
 * Every division returns `null` on a zero denominator (never Infinity/NaN); the caller renders "N/A".
 */

import type { ComplexityLevel, RiskLevel } from "../types";

/** Complexity → points (Low=1, Medium=2, High=3, Critical=5). */
export const COMPLEXITY_POINTS: Record<ComplexityLevel, number> = {
    Low: 1,
    Medium: 2,
    High: 3,
    Critical: 5,
};

/** Risk → points (Low=1, Medium=2, High=3). */
export const RISK_POINTS: Record<RiskLevel, number> = {
    Low: 1,
    Medium: 2,
    High: 3,
};

export interface EstimateInput {
    estimatedHours?: number | null;
    complexity?: ComplexityLevel | null;
    riskLevel?: RiskLevel | null;
    isFinalApproved?: boolean;
    status?: string;
}

export interface CapacityInput {
    engineerId: string;
    dailyCapacityHours: number;
}

const round = (value: number, dp: number): number => {
    const f = 10 ** dp;
    return Math.round((value + Number.EPSILON) * f) / f;
};

/** 1. Project Total Effort = sum of final-approved estimate hours. round(2). */
export function totalEffortHours(approved: EstimateInput[]): number {
    const sum = approved.reduce((acc, e) => acc + num(e.estimatedHours), 0);
    return round(sum, 2);
}

/**
 * 2. Team Capacity (hours/day) = sum of each DISTINCT engineer's MAX assignment capacity
 *    (an engineer assigned to 3 modules counts once, at their top allocation). round(2).
 */
export function teamCapacityHoursPerDay(capacities: CapacityInput[]): number {
    const byEngineer = new Map<string, number>();
    for (const c of capacities) {
        const prev = byEngineer.get(c.engineerId) ?? 0;
        if (c.dailyCapacityHours > prev) byEngineer.set(c.engineerId, c.dailyCapacityHours);
    }
    let sum = 0;
    for (const v of byEngineer.values()) sum += v;
    return round(sum, 2);
}

/**
 * 3. Project Duration (days) = total effort ÷ team capacity per day. `null` when capacity is 0.
 *    round(2). Matches the spec: 110 / (3 × 8) = 4.58 → ~5 working days.
 */
export function projectDurationDays(
    effortHours: number,
    capacityHoursPerDay: number,
): number | null {
    if (!capacityHoursPerDay || capacityHoursPerDay <= 0) return null;
    return round(effortHours / capacityHoursPerDay, 2);
}

/** 4. Utilization % = assigned hours ÷ available hours × 100. `null` when available is 0. round(1). */
export function utilizationPercent(
    assignedHours: number,
    availableHours: number,
): number | null {
    if (!availableHours || availableHours <= 0) return null;
    return round((assignedHours / availableHours) * 100, 1);
}

/** 5. Complexity Score = SUM of complexity points over the given estimates. Integer. */
export function complexityScore(estimates: EstimateInput[]): number {
    return estimates.reduce((acc, e) => acc + complexityPointsFor(e.complexity), 0);
}

/** 6. Risk Score = AVERAGE of risk points over the given estimates. round(2); 0 when empty. */
export function riskScore(estimates: EstimateInput[]): number {
    const scored = estimates.filter((e) => e.riskLevel != null);
    if (scored.length === 0) return 0;
    const sum = scored.reduce((acc, e) => acc + riskPointsFor(e.riskLevel), 0);
    return round(sum / scored.length, 2);
}

// ── point lookups (tolerate null/unknown → 0) ─────────────────────────

export function complexityPointsFor(level?: ComplexityLevel | null): number {
    return level ? COMPLEXITY_POINTS[level] ?? 0 : 0;
}

export function riskPointsFor(level?: RiskLevel | null): number {
    return level ? RISK_POINTS[level] ?? 0 : 0;
}

function num(v: number | null | undefined): number {
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
}
