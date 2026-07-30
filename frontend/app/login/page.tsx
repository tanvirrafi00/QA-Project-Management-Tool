'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/features/auth/AuthContext';
import {
    validateLogin,
    type FieldErrors,
} from '@/features/auth/validation';

const inputBase =
    'w-full h-11 px-4 rounded-xl border bg-white focus:outline-none focus:ring-2 focus:ring-[#06B6D4]/30 transition-colors';
const inputOk = 'border-[#E2E8F0]';
const inputErr = 'border-[#EF4444] focus:ring-[#EF4444]/30';

export default function LoginPage() {
    const router = useRouter();
    const { login } = useAuth();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
    const [formError, setFormError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    async function onSubmit(e: FormEvent) {
        e.preventDefault();
        setFormError(null);

        const errors = validateLogin({ email, password });
        setFieldErrors(errors);
        if (Object.keys(errors).length > 0) {
            setFormError('Please correct the highlighted fields.');
            return;
        }

        setSubmitting(true);
        try {
            const result = await login(email, password);
            if (result.success) {
                router.push('/');
                return;
            }

            // Backend returns a status-specific error (invalid credentials, pending,
            // rejected, suspended, or a generic server error). Surface it directly.
            if (result.errors && Object.keys(result.errors).length > 0) {
                setFieldErrors(result.errors);
                setFormError(result.error || 'Please correct the highlighted fields.');
            } else {
                setFormError(result.error || 'Unable to sign in. Please try again later.');
            }
        } catch {
            setFormError('Unable to sign in. Please check your connection and try again.');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] px-4 py-10">
            <div className="w-full max-w-md bg-white rounded-2xl border border-[#E2E8F0] shadow-sm p-8">
                <h1 className="text-2xl font-bold text-[#0F172A]">Login</h1>
                <p className="text-sm text-[#64748B] mt-1 mb-6">
                    Enter your credentials to access your account.
                </p>

                {formError && (
                    <div role="alert" className="bg-[#FEF2F2] border border-[#EF4444]/30 text-[#B91C1C] text-sm px-4 py-3 rounded-xl mb-4">
                        {formError}
                    </div>
                )}

                <form onSubmit={onSubmit} className="space-y-4" noValidate>
                    <div>
                        <label
                            htmlFor="email"
                            className="text-xs font-semibold text-[#475569] mb-1.5 block"
                        >
                            Email <span className="text-[#EF4444]">*</span>
                        </label>
                        <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            autoComplete="email"
                            autoFocus
                            aria-invalid={!!fieldErrors.email}
                            className={`${inputBase} ${fieldErrors.email ? inputErr : inputOk}`}
                        />
                        {fieldErrors.email && (
                            <p className="text-xs text-[#EF4444] mt-1">{fieldErrors.email}</p>
                        )}
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <label
                                htmlFor="password"
                                className="text-xs font-semibold text-[#475569]"
                            >
                                Password <span className="text-[#EF4444]">*</span>
                            </label>
                            <Link
                                href="/forgot-password"
                                prefetch={false}
                                className="text-xs text-[#06B6D4] font-medium hover:underline"
                            >
                                Forgot Password?
                            </Link>
                        </div>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoComplete="current-password"
                            aria-invalid={!!fieldErrors.password}
                            className={`${inputBase} ${fieldErrors.password ? inputErr : inputOk}`}
                        />
                        {fieldErrors.password && (
                            <p className="text-xs text-[#EF4444] mt-1">{fieldErrors.password}</p>
                        )}
                    </div>

                    <button
                        type="submit"
                        disabled={submitting}
                        className="w-full h-11 rounded-xl bg-[#06B6D4] hover:bg-[#0891B2] disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
                    >
                        {submitting ? 'Signing in…' : 'Login'}
                    </button>
                </form>

                <p className="text-sm text-[#64748B] mt-6 text-center">
                    Don't have an account?{' '}
                    <Link href="/register" prefetch={false} className="text-[#06B6D4] font-medium hover:underline">
                        Register
                    </Link>
                </p>
            </div>
        </div>
    );
}
