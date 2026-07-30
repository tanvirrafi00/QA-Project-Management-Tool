/**
 * Proxy (Next.js 16 rename of `middleware.ts`) — edge route protection.
 *
 * Checks for the `auth-token` (httpOnly) cookie:
 *   - missing on a protected route → redirect to /login?redirect=<path>
 *   - present on /login or /register → redirect to / (avoid showing auth pages when logged in)
 *
 * This is a navigation guard only. Real authorization is enforced in the server actions + backend
 * (the access token is verified server-side on every request) — per the Next 16 proxy guidance to
 * not rely on proxy alone.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/** Routes reachable without a session. */
const PUBLIC_ROUTES = new Set([
    '/login',
    '/register',
    '/register/success',
    '/forgot-password',
    '/access-denied',
]);
/** Auth-only routes — a signed-in user hitting these is bounced to the dashboard. */
const AUTH_PAGES = new Set(['/login', '/register', '/register/success', '/forgot-password']);
const AUTH_COOKIE = 'auth-token';

export function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const token = request.cookies.get(AUTH_COOKIE)?.value;
    const isPublic = PUBLIC_ROUTES.has(pathname);

    if (!token && !isPublic) {
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('redirect', pathname);
        return NextResponse.redirect(loginUrl);
    }

    if (token && AUTH_PAGES.has(pathname)) {
        return NextResponse.redirect(new URL('/', request.url));
    }

    const response = NextResponse.next();
    response.headers.set('X-Frame-Options', 'SAMEORIGIN');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    return response;
}

export const config = {
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
