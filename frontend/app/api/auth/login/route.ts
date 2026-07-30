/**
 * POST /api/auth/login — Route Handler (returns clean JSON, not the RSC wire format).
 *
 * Proxies to the backend `POST /api/auth/login`, stores the access + refresh tokens in httpOnly
 * cookies (so client JS can't read them), and returns `{ success, user }` as a JSON body.
 *
 * Why a Route Handler instead of a server action: server actions return the React Server Components
 * (Flight) wire format over HTTP, which is not human-readable JSON in the browser Network tab. This
 * handler gives a standard JSON response while keeping cookie management server-side.
 *
 * Envelope (docs/api-standards.md §4/§8):
 *   success → { success: true, user }
 *   error   → { success: false, error, errors? }
 */

import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/api-client";
import { ACCESS_COOKIE, REFRESH_COOKIE, cookieOptions } from "@/lib/auth-cookies";
import { jsonBody } from "@/lib/server-auth";

export async function POST(req: NextRequest) {
    const input = await req.json().catch(() => ({}));

    const res = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
    });

    const payload = await jsonBody(res);

    if (!res.ok) {
        // The backend error envelope uses `message` (e.g. account-pending/rejected/suspended denial
        // reasons); normalize it to the `error` field the client reads.
        return NextResponse.json(
            {
                success: false,
                error: payload.error || payload.message || "Invalid email or password.",
                errors: payload.errors,
            },
            { status: res.status },
        );
    }

    const data = payload.data;
    if (!data?.user || !data.accessToken || !data.refreshToken) {
        return NextResponse.json(
            { success: false, error: payload.error || payload.message || "Login succeeded but the session was malformed." },
            { status: 502 },
        );
    }
    const response = NextResponse.json({ success: true, user: data.user });
    response.cookies.set(ACCESS_COOKIE, data.accessToken, cookieOptions());
    response.cookies.set(REFRESH_COOKIE, data.refreshToken, cookieOptions());
    return response;
}
