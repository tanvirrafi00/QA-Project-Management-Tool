/**
 * POST /api/auth/logout — Route Handler (returns clean JSON).
 *
 * Reads the access + refresh cookies, calls the backend `POST /api/auth/logout` (Bearer access
 * token) to revoke the refresh token server-side, then clears both session cookies. Security-first:
 * cookies are cleared and `{ success: true }` is returned even when the backend call fails, so the
 * caller always ends up logged out locally.
 *
 * Envelope: { success: true } | { success: false, error }
 */

import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/api-client";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/auth-cookies";
import { type AuthEnvelope } from "@/lib/server-auth";

export async function POST(req: NextRequest) {
    const access = req.cookies.get(ACCESS_COOKIE)?.value;
    const refresh = req.cookies.get(REFRESH_COOKIE)?.value;

    let success = true;
    let error: string | undefined;

    if (access) {
        try {
            const res = await fetch(`${API_URL}/api/auth/logout`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${access}`,
                },
                body: JSON.stringify(refresh ? { refreshToken: refresh } : {}),
            });
            if (!res.ok) {
                const payload = (await res.json().catch(() => ({}))) as AuthEnvelope;
                success = false;
                error = payload.error || payload.message || "Unable to logout. Please try again.";
            }
        } catch {
            // Network/server failure — fall through; we still clear local state below.
            success = false;
            error = "Unable to logout. Please try again.";
        }
    }

    // Always clear the session cookies so the client is logged out regardless of the API outcome.
    const response = NextResponse.json({ success, error });
    response.cookies.delete(ACCESS_COOKIE);
    response.cookies.delete(REFRESH_COOKIE);
    return response;
}
