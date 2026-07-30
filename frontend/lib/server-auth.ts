/**
 * Server-side auth helpers — shared by the Route Handlers under `app/api/`.
 *
 * The single source of truth for the cookie → Bearer → refresh flow. Previously
 * this logic was duplicated (and buggy) in `app/api/[...path]/route.ts` and
 * `app/api/auth/me/route.ts`: both discarded the rotated *refresh* token, so
 * after one refresh the cookie held a revoked token and every later refresh
 * failed with 401.
 *
 * Two things must be true for refresh to be robust:
 *
 *  1. The backend (`authService.refresh`) ROTATES refresh tokens — it revokes the
 *     presented token and issues a fresh access + refresh pair — so BOTH tokens
 *     must be persisted on every successful refresh (`persistTokens`).
 *
 *  2. Concurrent requests (e.g. `/api/auth/me` and `/api/projects` firing together)
 *     all carry the SAME refresh cookie. If each fires its own `/api/auth/refresh`,
 *     only the first wins (the backend revokes the token); the rest get 401. So
 *     refreshes are DEDUPED: one in-flight promise is shared, and a short result
 *     cache lets requests arriving just after completion reuse the same rotated
 *     pair (until the browser applies the new cookie).
 */

import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/api-client";
import { ACCESS_COOKIE, REFRESH_COOKIE, cookieOptions } from "@/lib/auth-cookies";

export interface RotatedTokens {
    accessToken: string;
    refreshToken: string;
}

/** Shape of the backend auth envelope (single source for the Route Handlers). */
export interface AuthEnvelope {
    success?: boolean;
    error?: string;
    errors?: Record<string, string>;
    message?: string;
    data?: {
        user?: Record<string, unknown>;
        accessToken?: string;
        refreshToken?: string;
    } | null;
}

/** Parse a backend auth response into the typed envelope (never throws). */
export async function jsonBody(res: Response): Promise<AuthEnvelope> {
    return (await res.json().catch(() => ({}))) as AuthEnvelope;
}

/** How long a successful refresh result is reused for coalescing concurrent callers. */
const REFRESH_CACHE_MS = 5000;

let inflightRefresh: Promise<RotatedTokens | null> | null = null;
let lastRefresh: { oldToken: string; tokens: RotatedTokens; expiresAt: number } | null = null;

/**
 * Attempt ONE token refresh using the `refresh-token` cookie, with concurrency dedupe.
 * Returns the new token pair on success, or `null` when there is no refresh cookie or
 * the backend rejected it (revoked / expired).
 */
export async function refreshSession(req: NextRequest): Promise<RotatedTokens | null> {
    const refresh = req.cookies.get(REFRESH_COOKIE)?.value;
    if (!refresh) return null;

    // Reuse a recent successful refresh for the same cookie value. Concurrent requests
    // all carry the same (now-revoked) cookie until the browser applies the rotated one,
    // so this coalesces them into a single backend refresh.
    if (lastRefresh && lastRefresh.oldToken === refresh && Date.now() < lastRefresh.expiresAt) {
        return lastRefresh.tokens;
    }

    // Share a single in-flight refresh across concurrent callers.
    if (inflightRefresh) {
        return inflightRefresh;
    }

    inflightRefresh = (async (): Promise<RotatedTokens | null> => {
        try {
            const r = await fetch(`${API_URL}/api/auth/refresh`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ refreshToken: refresh }),
            });
            if (!r.ok) return null;

            const data = (await jsonBody(r)).data as
                | { accessToken?: string; refreshToken?: string }
                | undefined;
            if (!data?.accessToken || !data?.refreshToken) return null;

            const tokens: RotatedTokens = {
                accessToken: data.accessToken,
                refreshToken: data.refreshToken,
            };
            lastRefresh = { oldToken: refresh, tokens, expiresAt: Date.now() + REFRESH_CACHE_MS };
            return tokens;
        } finally {
            inflightRefresh = null;
        }
    })();

    return inflightRefresh;
}

/** Persist a freshly rotated token pair onto the response cookies. */
export function persistTokens(res: NextResponse, tokens: RotatedTokens): void {
    res.cookies.set(ACCESS_COOKIE, tokens.accessToken, cookieOptions());
    res.cookies.set(REFRESH_COOKIE, tokens.refreshToken, cookieOptions());
}

/**
 * Clear both session cookies. Used when auth is unrecoverable (refresh failed)
 * so the client treats the user as logged out instead of looping on a stale,
 * revoked refresh token.
 */
export function clearTokens(res: NextResponse): void {
    res.cookies.set(ACCESS_COOKIE, "", { ...cookieOptions(), maxAge: 0 });
    res.cookies.set(REFRESH_COOKIE, "", { ...cookieOptions(), maxAge: 0 });
}
