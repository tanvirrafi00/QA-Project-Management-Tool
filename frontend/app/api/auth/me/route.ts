/**
 * GET /api/auth/me — Route Handler (returns clean JSON).
 *
 * Resolves the current user from the `auth-token` (httpOnly) cookie. On a 401, tries one refresh
 * via `refreshSession` (which rotates BOTH the access and refresh cookies — the backend revokes the
 * old refresh token on each refresh), then retries `/me`. Returns `{ success: true, user: null }`
 * when unauthenticated (never throws). If refresh is unrecoverable, both cookies are cleared so the
 * client logs out cleanly instead of looping on a revoked token.
 *
 * Envelope: { success: true, user: SessionUser | null }
 */

import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/api-client";
import { ACCESS_COOKIE } from "@/lib/auth-cookies";
import { refreshSession, persistTokens, clearTokens, jsonBody } from "@/lib/server-auth";

export async function GET(req: NextRequest) {
    const access = req.cookies.get(ACCESS_COOKIE)?.value;
    if (!access) {
        return NextResponse.json({ success: true, user: null });
    }

    let res = await fetch(`${API_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${access}` },
    });

    // On a 401, try one refresh — rotate BOTH cookies and retry /me.
    let rotated = null;
    if (res.status === 401) {
        rotated = await refreshSession(req);
        if (rotated) {
            res = await fetch(`${API_URL}/api/auth/me`, {
                headers: { Authorization: `Bearer ${rotated.accessToken}` },
            });
        }
    }

    const user = res.ok ? ((await jsonBody(res)).data?.user ?? null) : null;

    const response = NextResponse.json({ success: true, user });
    if (rotated) {
        // Persist the freshly rotated access + refresh tokens (both — backend rotation revokes the old refresh).
        persistTokens(response, rotated);
    } else if (!res.ok) {
        // Refresh failed → session is unrecoverable. Clear stale cookies so the client logs out cleanly.
        clearTokens(response);
    }
    return response;
}
