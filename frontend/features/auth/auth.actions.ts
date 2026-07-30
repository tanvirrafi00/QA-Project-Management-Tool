/**
 * Auth client functions — call the Next.js Route Handlers under /api/auth.
 *
 * These were previously a "use server" server-action module, but server actions return the React
 * Server Components (Flight) wire format over HTTP — not human-readable JSON — so the browser Network
 * tab showed an opaque blob instead of a JSON body. Switching to Route Handlers (one file per action
 * under app/api/auth) gives clean JSON response bodies while keeping all cookie management
 * server-side (httpOnly) and identical to before.
 *
 * Cookie handling lives entirely in the Route Handlers; these functions are thin fetch wrappers that
 * return the project-standard envelope.
 */

import type { AuthResult, SessionUser } from "./types";

export interface LogoutResult {
    success: boolean;
    error?: string;
}

/** POST JSON and parse the JSON envelope, with a safe fallback on network failure. */
async function postJson<T>(url: string, data?: unknown): Promise<T> {
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: data ? JSON.stringify(data) : undefined,
        });
        return (await res.json().catch(() => ({}))) as T;
    } catch {
        return { success: false, error: "Network error. Please try again." } as T;
    }
}

/** POST /api/auth/login — sets httpOnly cookies (in the handler), returns the user. */
export async function loginAction(input: {
    email: string;
    password: string;
}): Promise<AuthResult> {
    return postJson<AuthResult>("/api/auth/login", input);
}

/** POST /api/auth/register — account created in pending_approval (NOT logged in). */
export async function registerAction(input: {
    name: string;
    email: string;
    password: string;
    /** Requested role (qa_lead | qa_engineer) — admin assigns the final role at approval. */
    role: string;
}): Promise<AuthResult> {
    return postJson<AuthResult>("/api/auth/register", input);
}

/**
 * POST /api/auth/logout to revoke the refresh token server-side and clear both session cookies.
 * Security-first: the handler always clears local state and returns success even on backend
 * failure, so the caller always ends up logged out.
 */
export async function logoutAction(): Promise<LogoutResult> {
    return postJson<LogoutResult>("/api/auth/logout");
}

/**
 * GET /api/auth/me — resolve the current user from the httpOnly cookie. The handler refreshes once
 * on a 401 so sessions survive access-token expiry. Returns success with a null user when
 * unauthenticated.
 */
export async function getCurrentUserAction(): Promise<{
    success: true;
    user: SessionUser | null;
}> {
    try {
        const res = await fetch("/api/auth/me");
        return (await res.json().catch(() => ({ success: true, user: null }))) as {
            success: true;
            user: SessionUser | null;
        };
    } catch {
        return { success: true, user: null };
    }
}
