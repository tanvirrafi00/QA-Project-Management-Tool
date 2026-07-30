'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { useAuth } from '@/features/auth/AuthContext';
import { ChevronDown, LogOut, Loader2 } from 'lucide-react';

/**
 * User menu — the profile affordance in the Header.
 *
 * Renders an avatar button that opens a portal-based dropdown (so the Header's `overflow-hidden`
 * can't clip it) showing the signed-in user's name, email, and role. "Logout" opens a confirmation
 * dialog; confirming calls the protected logout endpoint, then redirects to `/login`.
 *
 * Security-first fallback: `logout()` (via `logoutAction`) ALWAYS clears the session cookies and
 * in-memory principal, so we redirect to `/login` regardless of whether the server call succeeded.
 */
export function UserMenu() {
    const router = useRouter();
    const { user, logout } = useAuth();

    const [mounted, setMounted] = useState(false);
    const [open, setOpen] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [loading, setLoading] = useState(false);
    const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });

    const btnRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => setMounted(true), []);

    // Reposition the dropdown whenever it opens.
    useEffect(() => {
        if (!open || !btnRef.current) return;
        const r = btnRef.current.getBoundingClientRect();
        setMenuPos({ top: r.bottom + 8, right: window.innerWidth - r.right });
    }, [open]);

    // Close the dropdown on outside click / Escape.
    useEffect(() => {
        if (!open) return;
        function onPointer(e: MouseEvent) {
            if (
                menuRef.current &&
                !menuRef.current.contains(e.target as Node) &&
                btnRef.current &&
                !btnRef.current.contains(e.target as Node)
            ) {
                setOpen(false);
            }
        }
        function onEsc(e: KeyboardEvent) {
            if (e.key === 'Escape') setOpen(false);
        }
        document.addEventListener('mousedown', onPointer);
        document.addEventListener('keydown', onEsc);
        return () => {
            document.removeEventListener('mousedown', onPointer);
            document.removeEventListener('keydown', onEsc);
        };
    }, [open]);

    const handleLogout = useCallback(async () => {
        setLoading(true);
        try {
            await logout();
        } finally {
            setLoading(false);
            // Security-first: cookies + principal are always cleared by logoutAction, so redirect
            // to /login regardless of the server outcome.
            setOpen(false);
            setConfirming(false);
            router.push('/login');
        }
    }, [logout, router]);

    const initials = user?.name
        ? user.name
              .split(' ')
              .map((p) => p[0])
              .filter(Boolean)
              .slice(0, 2)
              .join('')
              .toUpperCase()
        : null;

    return (
        <>
            <button
                ref={btnRef}
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex items-center gap-2 h-10 pl-1 pr-2 rounded-xl hover:bg-[#F1F5F9] transition-colors flex-shrink-0"
                aria-haspopup="menu"
                aria-expanded={open}
            >
                <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center text-white text-xs font-semibold shadow-sm">
                    {initials || <LogOut className="w-4 h-4" />}
                </span>
                <ChevronDown
                    className={`w-4 h-4 text-[#64748B] transition-transform ${open ? 'rotate-180' : ''}`}
                />
            </button>

            {mounted &&
                open &&
                createPortal(
                    <div
                        ref={menuRef}
                        style={{ position: 'fixed', top: menuPos.top, right: menuPos.right }}
                        className="w-64 bg-white rounded-2xl border border-[#E2E8F0] shadow-lg py-2 z-50"
                        role="menu"
                    >
                        <div className="px-4 py-3 border-b border-[#F1F5F9]">
                            <p className="text-sm font-semibold text-[#0F172A] truncate">
                                {user?.name ?? 'User'}
                            </p>
                            <p className="text-xs text-[#64748B] truncate">{user?.email}</p>
                            {user?.role && (
                                <span className="inline-block mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#06B6D4] bg-[#ECFEFF] border border-[#06B6D4]/20 rounded-md px-1.5 py-0.5">
                                    {user.role.replace('_', ' ')}
                                </span>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                setOpen(false);
                                setConfirming(true);
                            }}
                            className="w-full flex items-center gap-2.5 px-4 h-10 text-sm font-medium text-[#DC2626] hover:bg-[#FEF2F2] transition-colors"
                            role="menuitem"
                        >
                            <LogOut className="w-4 h-4" />
                            Logout
                        </button>
                    </div>,
                    document.body,
                )}

            {mounted &&
                confirming &&
                createPortal(
                    <div
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
                        onClick={() => !loading && setConfirming(false)}
                    >
                        <div
                            className="w-full max-w-sm bg-white rounded-2xl border border-[#E2E8F0] shadow-xl p-6"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <h2 className="text-lg font-semibold text-[#0F172A]">Logout</h2>
                            <p className="text-sm text-[#64748B] mt-2 mb-6">
                                Are you sure you want to logout?
                            </p>
                            <div className="flex items-center justify-end gap-3">
                                <button
                                    type="button"
                                    disabled={loading}
                                    onClick={() => setConfirming(false)}
                                    className="h-10 px-4 rounded-xl text-sm font-semibold text-[#475569] hover:bg-[#F1F5F9] disabled:opacity-60 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    disabled={loading}
                                    onClick={handleLogout}
                                    className="h-10 px-4 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                                >
                                    {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                                    {loading ? 'Logging out...' : 'Logout'}
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body,
                )}
        </>
    );
}
