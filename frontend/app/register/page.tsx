'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/features/auth/AuthContext';
import {
    validateRegistration,
    type FieldErrors,
} from '@/features/auth/validation';
import { apiClient } from '@/lib/api-client';
import { CustomSelect } from '@/components/ui/CustomSelect';

interface RoleOption {
    value: string;
    label: string;
}

const inputBase =
    'w-full h-11 px-4 rounded-xl border bg-white focus:outline-none focus:ring-2 focus:ring-[#06B6D4]/30 transition-colors';
const inputOk = 'border-[#E2E8F0]';
const inputErr = 'border-[#EF4444] focus:ring-[#EF4444]/30';

export default function RegisterPage() {
    const router = useRouter();
    const { register } = useAuth();

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [role, setRole] = useState('');
    const [roles, setRoles] = useState<RoleOption[]>([]);
    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
    const [formError, setFormError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    // Requestable roles come from the system config (GET /api/auth/roles), never hardcoded — so
    // adding a role on the backend flows into the dropdown automatically.
    useEffect(() => {
        apiClient.get<RoleOption[]>('/api/auth/roles').then((res) => {
            if (res.success && res.data) setRoles(res.data);
        }).catch(() => {
            /* roles stay empty; validation surfaces an empty-role error on submit */
        });
    }, []);

    async function onSubmit(e: FormEvent) {
        e.preventDefault();
        setFormError(null);

        const errors = validateRegistration({ name, email, password, confirm, role });
        setFieldErrors(errors);
        if (Object.keys(errors).length > 0) {
            setFormError('Please correct the highlighted fields.');
            return;
        }

        setSubmitting(true);
        try {
            const result = await register(name, email, password, role);
            if (result.success) {
                const label = roles.find((r) => r.value === role)?.label ?? role;
                router.push(`/register/success?role=${encodeURIComponent(label)}`);
                return;
            }

            // Merge backend field-level errors (if any) with a top-level error message.
            if (result.errors && Object.keys(result.errors).length > 0) {
                setFieldErrors(result.errors);
                setFormError(result.error || 'Please correct the highlighted fields.');
            } else {
                setFormError(result.error || 'Unable to complete registration. Please try again later.');
            }
        } catch {
            setFormError('Unable to complete registration. Please check your connection and try again.');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] px-4 py-10">
            <div className="w-full max-w-md bg-white rounded-2xl border border-[#E2E8F0] shadow-sm p-8">
                <h1 className="text-2xl font-bold text-[#0F172A]">Registration</h1>
                <p className="text-sm text-[#64748B] mt-1 mb-6">
                    Create your account — an administrator will review and approve it before you can sign in.
                </p>

                {formError && (
                    <div role="alert" className="bg-[#FEF2F2] border border-[#EF4444]/30 text-[#B91C1C] text-sm px-4 py-3 rounded-xl mb-4">
                        {formError}
                    </div>
                )}

                <form onSubmit={onSubmit} className="space-y-4" noValidate>
                    <div>
                        <label htmlFor="name" className="text-xs font-semibold text-[#475569] mb-1.5 block">
                            Full Name <span className="text-[#EF4444]">*</span>
                        </label>
                        <input
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            autoComplete="name"
                            autoFocus
                            aria-invalid={!!fieldErrors.name}
                            className={`${inputBase} ${fieldErrors.name ? inputErr : inputOk}`}
                        />
                        {fieldErrors.name && (
                            <p className="text-xs text-[#EF4444] mt-1">{fieldErrors.name}</p>
                        )}
                    </div>

                    <div>
                        <label htmlFor="email" className="text-xs font-semibold text-[#475569] mb-1.5 block">
                            Email <span className="text-[#EF4444]">*</span>
                        </label>
                        <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            autoComplete="email"
                            aria-invalid={!!fieldErrors.email}
                            className={`${inputBase} ${fieldErrors.email ? inputErr : inputOk}`}
                        />
                        {fieldErrors.email && (
                            <p className="text-xs text-[#EF4444] mt-1">{fieldErrors.email}</p>
                        )}
                    </div>

                    <div>
                        <label htmlFor="password" className="text-xs font-semibold text-[#475569] mb-1.5 block">
                            Password <span className="text-[#EF4444]">*</span>
                        </label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoComplete="new-password"
                            aria-invalid={!!fieldErrors.password}
                            className={`${inputBase} ${fieldErrors.password ? inputErr : inputOk}`}
                        />
                        {fieldErrors.password ? (
                            <p className="text-xs text-[#EF4444] mt-1">{fieldErrors.password}</p>
                        ) : (
                            <p className="text-xs text-[#94A3B8] mt-1">
                                At least 8 characters with an uppercase letter, a lowercase letter, and a number.
                            </p>
                        )}
                    </div>

                    <div>
                        <label htmlFor="confirm" className="text-xs font-semibold text-[#475569] mb-1.5 block">
                            Confirm Password <span className="text-[#EF4444]">*</span>
                        </label>
                        <input
                            id="confirm"
                            type="password"
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                            autoComplete="new-password"
                            aria-invalid={!!fieldErrors.confirm}
                            className={`${inputBase} ${fieldErrors.confirm ? inputErr : inputOk}`}
                        />
                        {fieldErrors.confirm && (
                            <p className="text-xs text-[#EF4444] mt-1">{fieldErrors.confirm}</p>
                        )}
                    </div>

                    {/* Role (requested — admin assigns the final role at approval) */}
                    <div>
                        <label className="text-xs font-semibold text-[#475569] mb-1.5 block">
                            Role <span className="text-[#EF4444]">*</span>
                        </label>
                        <div className={fieldErrors.role ? 'rounded-xl ring-2 ring-[#EF4444]/30' : ''}>
                            <CustomSelect
                                options={roles}
                                value={role}
                                onChange={setRole}
                                placeholder="Choose your role"
                                height={44}
                            />
                        </div>
                        {fieldErrors.role ? (
                            <p className="text-xs text-[#EF4444] mt-1">{fieldErrors.role}</p>
                        ) : (
                            <p className="text-xs text-[#94A3B8] mt-1">
                                Your request is reviewed by an administrator before activation.
                            </p>
                        )}
                    </div>

                    <button
                        type="submit"
                        disabled={submitting}
                        className="w-full h-11 rounded-xl bg-[#06B6D4] hover:bg-[#0891B2] disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
                    >
                        {submitting ? 'Registering…' : 'Register'}
                    </button>
                </form>

                <p className="text-sm text-[#64748B] mt-6 text-center">
                    Already have an account?{' '}
                    <Link href="/login" prefetch={false} className="text-[#06B6D4] font-medium hover:underline">
                        Login
                    </Link>
                </p>
            </div>
        </div>
    );
}
