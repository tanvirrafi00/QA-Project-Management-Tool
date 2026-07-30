import Link from 'next/link';

/**
 * Forgot password — informational page.
 *
 * There is no self-service password-reset endpoint yet (see docs/rbac-design.md). Because this
 * platform gates accounts behind administrator approval, password resets are handled by an
 * administrator. This page is intentionally NOT a mock form — it states the real flow honestly.
 */
export default function ForgotPasswordPage() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] px-4 py-10">
            <div className="w-full max-w-md bg-white rounded-2xl border border-[#E2E8F0] shadow-sm p-8 text-center">
                <div className="w-12 h-12 rounded-full bg-[#E0F2FE] flex items-center justify-center mx-auto mb-4">
                    <span className="text-[#06B6D4] text-xl">?</span>
                </div>
                <h1 className="text-2xl font-semibold text-[#0F172A]">Forgot your password?</h1>
                <p className="text-sm text-[#64748B] mt-2 mb-6">
                    Password resets are managed by an administrator. Please contact your administrator
                    to have your password reset, then return here to sign in with your new credentials.
                </p>
                <Link
                    href="/login"
                    prefetch={false}
                    className="inline-flex items-center justify-center h-11 px-6 rounded-xl bg-[#06B6D4] hover:bg-[#0891B2] text-white text-sm font-semibold transition-colors"
                >
                    Back to Login
                </Link>
            </div>
        </div>
    );
}
