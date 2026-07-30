/**
 * Shared auth-cookie configuration — used by the Route Handlers under `app/api/auth/*`.
 *
 * Tokens live in two httpOnly cookies so client JS can never read them:
 *   - `auth-token`     → the short-lived (15 min) JWT access token
 *   - `refresh-token`  → the long-lived (7 day) rotating refresh token
 *
 * The proxy (`proxy.ts`) reads `auth-token` for the navigation guard, and the Route Handlers
 * read both to call the backend. Keep these names in sync with `proxy.ts`.
 */

export const ACCESS_COOKIE = "auth-token";
export const REFRESH_COOKIE = "refresh-token";

/** Refresh-token cookie lifetime (7 days). Access tokens are short-lived and rotated often. */
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

/** Standard httpOnly cookie options for session tokens. */
export function cookieOptions() {
    return {
        httpOnly: true,
        sameSite: "lax" as const,
        path: "/",
        maxAge: SESSION_MAX_AGE,
        secure: process.env.NODE_ENV === "production",
    };
}
