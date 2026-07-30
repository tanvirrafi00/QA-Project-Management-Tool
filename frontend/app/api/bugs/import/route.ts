/**
 * POST /api/bugs/import — dedicated Route Handler for the XLSX upload.
 *
 * Why a dedicated handler (not the catch-all at app/api/[...path]/route.ts): the catch-all reads
 * the body with `req.text()`, which UTF-8 decodes the bytes and corrupts the binary XLSX payload,
 * so multer on the backend cannot parse it. This handler reads `req.arrayBuffer()` (raw bytes) and
 * forwards them with the ORIGINAL `content-type` header — which carries the multipart boundary
 * multer needs — plus the `auth-token` cookie as a `Bearer` header (the browser can't read httpOnly
 * cookies, so this server-side bridge is the only way to authenticate the backend call).
 *
 * Static routes win over the `[...path]` catch-all in the App Router, so this handler takes
 * precedence for `/api/bugs/import` exactly. The JSON save (`/api/bugs/import/save`) has no static
 * handler and falls through to the catch-all correctly. The envelope is passed through unchanged.
 */

import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/api-client";
import { ACCESS_COOKIE } from "@/lib/auth-cookies";
import { refreshSession, persistTokens, clearTokens } from "@/lib/server-auth";

export async function POST(req: NextRequest): Promise<Response> {
    const target = `${API_URL}/api/bugs/import`;
    const access = req.cookies.get(ACCESS_COOKIE)?.value;

    // Forward the multipart content-type verbatim (it includes the boundary) + the Bearer token.
    const headers: Record<string, string> = {};
    const contentType = req.headers.get("content-type");
    if (contentType) headers["content-type"] = contentType;
    if (access) headers["authorization"] = `Bearer ${access}`;

    // Raw bytes — preserves the binary XLSX so multer can re-parse it on the backend.
    const body = await req.arrayBuffer();

    let res = await fetch(target, { method: "POST", headers, body });

    // On a 401, try one refresh — rotate BOTH cookies and retry the upload once.
    let rotated = null;
    if (res.status === 401) {
        rotated = await refreshSession(req);
        if (rotated) {
            headers["authorization"] = `Bearer ${rotated.accessToken}`;
            res = await fetch(target, { method: "POST", headers, body });
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
        persistTokens(response, rotated);
    } else if (res.status === 401) {
        clearTokens(response);
    }
    return response;
}
