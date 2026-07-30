/**
 * Unit tests for estimation-math — the single source of truth for estimation metrics.
 * These encode the worked examples from docs/reporting-rules.md / task.md.
 */

import {
    totalEffortHours,
    teamCapacityHoursPerDay,
    projectDurationDays,
    utilizationPercent,
    complexityScore,
    riskScore,
    complexityPointsFor,
    riskPointsFor,
    COMPLEXITY_POINTS,
    RISK_POINTS,
} from './estimation-math';

describe('estimation-math', () => {
    describe('point tables', () => {
        it('maps complexity Low=1/Medium=2/High=3/Critical=5', () => {
            expect(COMPLEXITY_POINTS).toEqual({ Low: 1, Medium: 2, High: 3, Critical: 5 });
        });
        it('maps risk Low=1/Medium=2/High=3', () => {
            expect(RISK_POINTS).toEqual({ Low: 1, Medium: 2, High: 3 });
        });
        it('handles unknown/missing levels as 0', () => {
            expect(complexityPointsFor(undefined)).toBe(0);
            expect(riskPointsFor(null)).toBe(0);
        });
    });

    describe('totalEffortHours', () => {
        it('sums approved estimate hours (spec example = 110)', () => {
            const approved = [
                { estimatedHours: 50 },
                { estimatedHours: 40 },
                { estimatedHours: 20 },
            ];
            expect(totalEffortHours(approved)).toBe(110);
        });
        it('returns 0 for empty input and tolerates missing hours', () => {
            expect(totalEffortHours([])).toBe(0);
            expect(totalEffortHours([{ estimatedHours: null }, {}])).toBe(0);
        });
    });

    describe('teamCapacityHoursPerDay', () => {
        it('sums each distinct engineer once (spec: 3 engineers × 8 = 24)', () => {
            const caps = [
                { engineerId: 'a', dailyCapacityHours: 8 },
                { engineerId: 'b', dailyCapacityHours: 8 },
                { engineerId: 'c', dailyCapacityHours: 8 },
            ];
            expect(teamCapacityHoursPerDay(caps)).toBe(24);
        });
        it('de-dups an engineer across modules, taking their max capacity', () => {
            const caps = [
                { engineerId: 'a', dailyCapacityHours: 8 },
                { engineerId: 'a', dailyCapacityHours: 6 }, // same engineer, second module
                { engineerId: 'b', dailyCapacityHours: 6 },
            ];
            // a counts once at 8, b at 6 → 14
            expect(teamCapacityHoursPerDay(caps)).toBe(14);
        });
    });

    describe('projectDurationDays', () => {
        it('effort ÷ capacity (spec: 110 / 24 = 4.58)', () => {
            expect(projectDurationDays(110, 24)).toBe(4.58);
        });
        it('returns null on zero capacity (no division by zero)', () => {
            expect(projectDurationDays(110, 0)).toBeNull();
        });
    });

    describe('utilizationPercent', () => {
        it('assigned ÷ available × 100 (spec: 50 / 40 = 125%)', () => {
            expect(utilizationPercent(50, 40)).toBe(125);
        });
        it('returns null on zero available', () => {
            expect(utilizationPercent(50, 0)).toBeNull();
        });
        it('rounds to 1 dp', () => {
            expect(utilizationPercent(1, 3)).toBe(33.3);
        });
    });

    describe('complexityScore', () => {
        it('sums complexity points (spec: Medium 2 + High 3 + Critical 5 = 10)', () => {
            const estimates = [
                { complexity: 'Medium' },
                { complexity: 'High' },
                { complexity: 'Critical' },
            ] as const;
            expect(complexityScore(estimates as any)).toBe(10);
        });
    });

    describe('riskScore', () => {
        it('averages risk points ((1+2+3)/3 = 2)', () => {
            const estimates = [
                { riskLevel: 'Low' },
                { riskLevel: 'Medium' },
                { riskLevel: 'High' },
            ] as const;
            expect(riskScore(estimates as any)).toBe(2);
        });
        it('returns 0 for empty input', () => {
            expect(riskScore([])).toBe(0);
        });
    });
});
