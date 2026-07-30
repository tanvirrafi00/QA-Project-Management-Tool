/**
 * POST /api/auth/register — Route Handler (returns clean JSON).
 *
 * Proxies to the backend `POST /api/auth/register`. New accounts are created in `pending_approval`
 * (NOT logged in) — no session cookies are set here. Returns `{ success: true }` on success.
 *
 * Envelope:
 *   success → { success: true }
 *   error   → { success: false, error, errors? }
 */

import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/api-client";
import { jsonBody } from "@/lib/server-auth";

export async function POST(req: NextRequest) {
    const input = await req.json().catch(() => ({}));

    const res = await fetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
    });

    const payload = await jsonBody(res);

    if (!res.ok) {
        // The backend error envelope uses `message` (see errorResponse/sendError); normalize it to the
        // `error` field the client reads (mirrors apiClient's `body.error || body.message`).
        return NextResponse.json(
            {
                success: false,
                error: payload.error || payload.message || "Unable to complete registration. Please try again later.",
                errors: payload.errors,
            },
            { status: res.status },
        );
    }

    return NextResponse.json({ success: true });
}
