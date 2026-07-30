/**
 * Catch-all Route Handler — the frontend→backend proxy for ALL data resources
 * (projects, bugs, test-cases, generate).
 *
 * This is the global frontend→backend boundary (docs/api-standards.md §9). It runs server-side,
 * reads the `auth-token` (httpOnly) cookie, and forwards it as an `Authorization: Bearer` header —
 * which is what the backend `authenticate` middleware expects (auth.ts reads the header, not cookies).
 * The browser cannot read httpOnly cookies, so the client cannot attach the token itself; this
 * server-side handler is the only place that can bridge the cookie → Bearer gap.
 *
 * On a 401 (expired access token), it tries ONE refresh via `refreshSession` (which rotates BOTH
 * the access and refresh cookies — the backend revokes the old refresh token on each refresh), then
 * retries the original request once. If refresh is unrecoverable, both cookies are cleared so the
 * client treats the user as logged out instead of looping on a revoked token.
 *
 * The dedicated auth handlers under app/api/auth/* take precedence over this catch-all (static
 * routes always win over `[...path]` in the App Router), so login/register/logout/me are unaffected.
 *
 * Envelope is passed through unchanged: { success, data?, error? } (+ count/version/changes/pagination).
 */

import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/api-client";
import { ACCESS_COOKIE } from "@/lib/auth-cookies";
import { refreshSession, persistTokens, clearTokens } from "@/lib/server-auth";

async function proxy(req: NextRequest): Promise<Response> {
    const { pathname, search } = req.nextUrl;
    const target = `${API_URL}${pathname}${search}`;
    const access = req.cookies.get(ACCESS_COOKIE)?.value;

    // Build outbound headers — forward content-type, attach the Bearer token from the cookie.
    // Do NOT forward the incoming `cookie` header; the backend authenticates via Bearer, not cookies.
    const headers: Record<string, string> = {};
    const contentType = req.headers.get("content-type");
    if (contentType) headers["content-type"] = contentType;
    if (access) headers["authorization"] = `Bearer ${access}`;

    const hasBody = req.method !== "GET" && req.method !== "HEAD";
    const body = hasBody ? await req.text() : undefined;

    let res = await fetch(target, { method: req.method, headers, body });

    // On a 401, try one refresh — rotate BOTH cookies and retry the original request once.
    let rotated = null;
    if (res.status === 401) {
        rotated = await refreshSession(req);
        if (rotated) {
            headers["authorization"] = `Bearer ${rotated.accessToken}`;
            res = await fetch(target, { method: req.method, headers, body });
        }
    }

    // Pass the backend response through unchanged (status + body + content-type).
    const text = await res.text();
    const response = new NextResponse(text, {
        status: res.status,
        headers: {
            "content-type": res.headers.get("content-type") || "application/json",
        },
    });

    if (rotated) {
        // Persist the freshly rotated access + refresh tokens (both — backend rotation revokes the old refresh).
        persistTokens(response, rotated);
    } else if (res.status === 401) {
        // Refresh failed → session is unrecoverable. Clear stale cookies so the client logs out cleanly.
        clearTokens(response);
    }
    return response;
}

export {
    proxy as GET,
    proxy as POST,
    proxy as PATCH,
    proxy as PUT,
    proxy as DELETE,
};
