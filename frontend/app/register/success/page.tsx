'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function RegisterSuccessPage() {
    const [role, setRole] = useState<string | null>(null);

    // The selected role label is passed via ?role= by the registration page. This is a one-time,
    // client-only URL read (window is unavailable during SSR) — the lint rule's cascading-render
    // concern doesn't apply to a mount-time read with no dependencies.
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setRole(params.get('role'));
    }, []);

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] px-4">
            <div className="w-full max-w-md bg-white rounded-2xl border border-[#E2E8F0] shadow-sm p-8 text-center">
                <div className="w-12 h-12 rounded-full bg-[#E0F2FE] flex items-center justify-center mx-auto mb-4">
                    <span className="text-[#06B6D4] text-xl">✓</span>
                </div>
                <h1 className="text-2xl font-semibold text-[#0F172A]">Registration Submitted Successfully</h1>
                <div className="text-sm text-[#64748B] mt-3 mb-6 space-y-1.5">
                    {role && (
                        <p>
                            Your selected role:{' '}
                            <span className="font-semibold text-[#0F172A]">{role}</span>
                        </p>
                    )}
                    <p>Your account is currently awaiting administrator approval.</p>
                    <p>You will be able to log in once your account has been approved.</p>
                </div>
                <Link
                    href="/login"
                    prefetch={false}
                    className="inline-flex items-center justify-center h-11 px-6 rounded-xl bg-[#06B6D4] hover:bg-[#0891B2] text-white text-sm font-semibold transition-colors"
                >
                    Go To Login
                </Link>
            </div>
        </div>
    );
}
