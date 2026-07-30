/**
 * Central API client for client-side data access.
 *
 * Single source of truth for:
 *   - the backend base URL
 *   - the standard `{ success, data, error }` envelope + error normalization
 *   - passthrough fields the backend adds (`changes`, `version`, `count`, `updated`, pagination)
 *   - opt-in pagination helpers (`?page` / `?page_size`).
 */

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

/** Pagination metadata returned by list endpoints when the client opts in (`?page`). */
export interface Pagination {
    page: number;
    pageSize: number;
    total: number;
}

/**
 * The full backend envelope. `data` is the primary payload; the rest are optional passthrough fields
 * (change-tracking on updates, counts on lists, pagination).
 */
export interface ApiEnvelope<T> {
    success: boolean;
    data?: T;
    error?: string;
    // update endpoints
    changes?: string[];
    version?: number;
    // list / bulk endpoints
    count?: number;
    updated?: number;
    // pagination (only when `?page` is sent)
    page?: number;
    page_size?: number;
    total?: number;
}

/** The shape every client service returns to its component caller. */
export type ActionResponse<T> = Pick<ApiEnvelope<T>, 'success' | 'data' | 'error'>;

/**
 * In-flight GET request deduplication.
 *
 * React StrictMode (on by default in Next.js dev) intentionally double-invokes effects on
 * mount, so a component's data-fetch `useEffect` runs twice — which means every GET fires
 * twice (e.g. `/api/projects` and `/api/projects/summary` each appear twice in the Network
 * tab). Multiple components can also request the same endpoint at the same time.
 *
 * This map keys concurrent GET requests by `METHOD path` and shares a single in-flight
 * promise across all callers. The entry is removed the instant the request settles, so a
 * genuine later refresh (a different tick) still hits the network. Only idempotent GETs are
 * deduped — POST/PATCH/DELETE are mutations and always execute.
 */
const inflight = new Map<string, Promise<ApiEnvelope<unknown>>>();

function dedupeKey(path: string, init?: RequestInit): string | null {
    const method = (init?.method ?? 'GET').toUpperCase();
    if (method !== 'GET') return null; // mutations always execute
    return `${method} ${path}`;
}

/** Performs the actual fetch and normalizes the response into the standard envelope. */
async function doFetch<T>(path: string, init?: RequestInit): Promise<ApiEnvelope<T>> {
    try {
        const headers = new Headers(init?.headers);
        if (!headers.has('Content-Type') && init?.method !== 'GET' && init?.method !== 'DELETE') {
            headers.set('Content-Type', 'application/json');
        }

        // Same-origin relative URL → routes through the catch-all Route Handler at
        // app/api/[...path]/route.ts, which forwards the httpOnly `auth-token` cookie as an
        // `Authorization: Bearer` header to the backend (port 5001). The browser cannot read
        // httpOnly cookies, so the token MUST be attached server-side in the Route Handler.
        // `credentials: 'same-origin'` ensures the httpOnly cookie is sent to the Route Handler.
        const res = await fetch(path, {
            ...init,
            headers,
            credentials: 'same-origin',
        });

        if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as Partial<ApiEnvelope<T>> & {
                message?: string;
                errors?: Record<string, string[]>;
            };
            return {
                success: false,
                error: body.error || body.message || `Request failed (${res.status})`,
            };
        }
        return (await res.json()) as ApiEnvelope<T>;
    } catch (err) {
        return {
            success: false,
            error: err instanceof Error ? err.message : 'Network error',
        };
    }
}

/**
 * Low-level request — returns the full envelope (with passthrough fields).
 *
 * Concurrent identical GETs are coalesced into a single network request (see `inflight`).
 * Mutations (POST/PATCH/DELETE) always execute independently.
 */
export async function apiRequest<T>(path: string, init?: RequestInit): Promise<ApiEnvelope<T>> {
    const key = dedupeKey(path, init);

    // Reuse an already-running identical GET so StrictMode double-fires and parallel
    // component mounts produce exactly one network round-trip.
    if (key) {
        const existing = inflight.get(key);
        if (existing) {
            return existing as Promise<ApiEnvelope<T>>;
        }
    }

    const promise = doFetch<T>(path, init);

    if (key) {
        inflight.set(key, promise as Promise<ApiEnvelope<unknown>>);
        // Clear as soon as it settles so the next genuine fetch hits the network.
        promise.finally(() => {
            if (inflight.get(key) === promise) inflight.delete(key);
        });
    }

    return promise;
}

/** Typed verb helpers. Each returns the full envelope; callers map to their action's return shape. */
export const apiClient = {
    get: <T>(path: string) => apiRequest<T>(path, { method: 'GET' }),
    post: <T>(path: string, data?: unknown) =>
        apiRequest<T>(path, {
            method: 'POST',
            body: data ? JSON.stringify(data) : undefined,
        }),
    patch: <T>(path: string, data?: unknown) =>
        apiRequest<T>(path, {
            method: 'PATCH',
            body: data ? JSON.stringify(data) : undefined,
        }),
    delete: <T>(path: string) => apiRequest<T>(path, { method: 'DELETE' }),
};

/* ---- pagination helpers ---- */

/** Add `page` / `page_size` to a query when the caller opts into client-side pagination. */
export function withPagination(
    query: URLSearchParams,
    opts?: { page?: number; pageSize?: number },
): void {
    if (opts?.page) query.set('page', String(opts.page));
    if (opts?.pageSize) query.set('page_size', String(opts.pageSize));
}

/** Extract a `Pagination` object from an envelope (undefined when the request was unpaged). */
export function paginationFromEnvelope<T>(e: ApiEnvelope<T>): Pagination | undefined {
    if (typeof e.page === 'number' && typeof e.page_size === 'number') {
        return { page: e.page, pageSize: e.page_size, total: e.total ?? 0 };
    }
    return undefined;
}
