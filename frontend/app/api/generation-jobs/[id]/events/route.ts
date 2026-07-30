/**
 * Streaming Route Handler — Phase 7 SSE passthrough for a single generation job.
 *
 * A SPECIFIC route (`app/api/generation-jobs/[id]/events`) takes precedence over the buffering
 * catch-all proxy (`app/api/[...path]`), so `GET /api/generation-jobs/:id/events` is handled here
 * instead of there. Unlike the catch-all (which does `await res.text()`), this pipes the backend's
 * SSE body straight through as a `ReadableStream` — no buffering — so each `data:` event is flushed
 * to the browser as it arrives.
 *
 * Auth is bridged the same way as the proxy: the httpOnly `auth-token` cookie (readable only
 * server-side) is forwarded as `Authorization: Bearer`. EventSource cannot set headers itself, so
 * this server-side bridge is required. No 401-refresh retry here on purpose: if the token is expired,
 * EventSource errors and the client falls back to the polling endpoint (which goes through the proxy
 * and DOES refresh).
 */

import { type NextRequest } from 'next/server';
import { API_URL } from '@/lib/api-client';
import { ACCESS_COOKIE } from '@/lib/auth-cookies';

// SSE needs an unbuffered, long-lived Node.js stream — not the default Edge runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;
    const access = _request.cookies.get(ACCESS_COOKIE)?.value;

    const headers: Record<string, string> = { accept: 'text/event-stream' };
    if (access) headers.authorization = `Bearer ${access}`;

    const upstream = await fetch(
        `${API_URL}/api/generation-jobs/${encodeURIComponent(id)}/events`,
        { headers, cache: 'no-store' },
    );

    if (!upstream.ok || !upstream.body) {
        return new Response(
            upstream.status === 404 ? 'Generation job not found or expired' : 'SSE upstream error',
            { status: upstream.status, headers: { 'content-type': 'application/json' } },
        );
    }

    // Pass the upstream stream through verbatim — the browser's EventSource parses the SSE frames.
    return new Response(upstream.body, {
        headers: {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache, no-transform',
            connection: 'keep-alive',
        },
    });
}
