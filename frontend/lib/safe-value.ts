/**
 * Safe value guards — guarantee the UI never renders `undefined`, `null`, `NaN`,
 * or `Infinity`. Every KPI/stat/table must pipe its values through these helpers
 * so a brand-new installation (zero data) still looks professional.
 *
 * See: Empty State & No-Data Handling Standard (stats calculations section).
 */

/**
 * Coerce anything into a finite number. Returns `fallback` (default `0`) for
 * undefined / null / NaN / Infinity / non-numeric strings.
 *
 * @example safeNumber(analytics?.passRate)        // 0 instead of undefined
 * @example safeNumber(analytics?.passRate, '—')   // custom fallback
 */
export function safeNumber<T = number>(
    value: unknown,
    fallback: T = 0 as unknown as T,
): number | T {
    if (value === null || value === undefined || value === '') return fallback;
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) return fallback;
    return n;
}

/**
 * Coerce anything into a non-negative integer count. Used for "N bugs",
 * "N test cases" style metrics where a negative or fractional value is nonsense.
 */
export function safeCount(value: unknown): number {
    const n = safeNumber(value, 0);
    return Math.max(0, Math.floor(n as number));
}

/**
 * Coerce anything into an array. Defends `.map` / `.length` against
 * undefined / null API payloads.
 */
export function safeArray<T>(value: unknown): T[] {
    if (Array.isArray(value)) return value as T[];
    return [];
}

/**
 * Coerce anything into a string. Never returns `undefined` / `null` / `"NaN"`.
 */
export function safeString(value: unknown, fallback = ''): string {
    if (value === null || value === undefined) return fallback;
    const s = String(value);
    if (s === 'undefined' || s === 'NaN' || s === 'null' || s === '[object Object]') {
        return fallback;
    }
    return s;
}

/**
 * Format a number for KPI display: finite numbers are localized, everything
 * invalid becomes `"0"`. Never emits `NaN` / `undefined`.
 */
export function formatStat(value: unknown): string {
    const n = safeNumber(value, 0);
    if (typeof n !== 'number') return String(n);
    return n.toLocaleString();
}

/**
 * Format a percentage 0–100 (or 0–1 fraction if `fromFraction` is true).
 * Always returns a string like `"0%"` / `"42%"`, never `NaN%`.
 */
export function formatPercent(value: unknown, fromFraction = false): string {
    let n = safeNumber(value, 0);
    if (typeof n !== 'number') return '0%';
    if (fromFraction) n = n * 100;
    return `${Math.round(n)}%`;
}
