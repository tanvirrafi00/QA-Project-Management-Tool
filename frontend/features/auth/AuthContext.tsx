'use client';

/**
 * Auth context — client-side session state.
 *
 * On mount it calls `getCurrentUserAction` (a server action) which resolves the user from the
 * httpOnly session cookie. Pages/components read `useAuth()` for `user`, `status`, and
 * `login`/`register`/`logout`. The backend + proxy enforce protection; this context is for UX.
 */

import {
    createContext,
    useContext,
    useEffect,
    useState,
    useCallback,
    useMemo,
    ReactNode,
} from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
    getCurrentUserAction,
    loginAction,
    logoutAction,
    registerAction,
    type LogoutResult,
} from './auth.actions';
import type { AuthResult, SessionUser } from './types';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

/** Routes that should NOT bounce to /login when the session is gone. */
const PUBLIC_ROUTES = new Set([
    '/login',
    '/register',
    '/register/success',
    '/forgot-password',
    '/access-denied',
]);

interface AuthContextValue {
    user: SessionUser | null;
    status: AuthStatus;
    login: (email: string, password: string) => Promise<AuthResult>;
    register: (name: string, email: string, password: string, role: string) => Promise<AuthResult>;
    logout: () => Promise<LogoutResult>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<SessionUser | null>(null);
    const [status, setStatus] = useState<AuthStatus>('loading');
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        let active = true;
        (async () => {
            const { user: u } = await getCurrentUserAction();
            if (!active) return;
            setUser(u);
            setStatus(u ? 'authenticated' : 'unauthenticated');
        })();
        return () => {
            active = false;
        };
    }, []);

    // Recover from an unrecoverable session: once the initial /me check resolves and there is no
    // user (refresh token revoked/expired — the Route Handlers have already cleared the cookies),
    // bounce protected pages to /login. The proxy (middleware) only guards navigation; this handles
    // the in-page case where a data fetch revealed the session is dead.
    useEffect(() => {
        if (status === 'unauthenticated' && pathname && !PUBLIC_ROUTES.has(pathname)) {
            router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
        }
    }, [status, pathname, router]);

    const login = useCallback(async (email: string, password: string): Promise<AuthResult> => {
        const result = await loginAction({ email, password });
        if (result.success && result.user) {
            setUser(result.user);
            setStatus('authenticated');
        }
        return result;
    }, []);

    const register = useCallback(
        async (name: string, email: string, password: string, role: string): Promise<AuthResult> => {
            return registerAction({ name, email, password, role });
        },
        [],
    );

    const logout = useCallback(async (): Promise<LogoutResult> => {
        const result = await logoutAction();
        // Always clear local session state — the server action clears the cookies; we reset the
        // in-memory principal so the UI reflects the logged-out state immediately.
        setUser(null);
        setStatus('unauthenticated');
        return result;
    }, []);

    const value = useMemo<AuthContextValue>(
        () => ({ user, status, login, register, logout }),
        [user, status, login, register, logout],
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
    return ctx;
}
