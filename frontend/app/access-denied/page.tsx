import Link from 'next/link';

export default function AccessDeniedPage() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] px-4">
            <div className="w-full max-w-md bg-white rounded-2xl border border-[#E2E8F0] shadow-sm p-8 text-center">
                <h1 className="text-2xl font-semibold text-[#0F172A]">Access denied</h1>
                <p className="text-sm text-[#64748B] mt-2 mb-6">
                    You don&apos;t have permission to view this page. If you believe this is a mistake,
                    contact your administrator.
                </p>
                <Link
                    href="/"
                    prefetch={false}
                    className="inline-flex items-center justify-center h-11 px-6 rounded-xl bg-[#06B6D4] hover:bg-[#0891B2] text-white text-sm font-semibold transition-colors"
                >
                    Go to dashboard
                </Link>
            </div>
        </div>
    );
}
