import { Priority } from '../../shared/types';

/**
 * Normalize a raw priority value to a standard agent Priority
 * ('Critical' | 'High' | 'Medium' | 'Low').
 *
 * Shared by BaseAgent and MergeAgent — the logic was duplicated verbatim in both, so it is
 * centralized here. NOTE: this is the *agent* flavor (matches 'crit'); the test-case and bug
 * repositories use different matching rules + return types and are intentionally NOT shared.
 */
export function normalizeAgentPriority(priority: unknown): Priority {
    if (!priority) return 'Medium';
    const p = String(priority).toLowerCase().trim();
    if (p.includes('crit')) return 'Critical';
    if (p.includes('high')) return 'High';
    if (p.includes('low')) return 'Low';
    return 'Medium';
}
