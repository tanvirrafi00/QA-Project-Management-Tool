/**
 * Auth form validation — client-side mirror of the backend identity rules
 * (`backend/src/modules/identity/validation.ts`).
 *
 * Returns field-level errors so the form can highlight the exact field and show its message,
 * matching the spec's "Please correct the highlighted fields." flow.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const PASSWORD_MIN_LENGTH = 8;

export type FieldErrors = Record<string, string>;

export function validateEmail(email: string): string | null {
    const value = email.trim();
    if (!value) return 'Email is required.';
    if (!EMAIL_RE.test(value)) return 'Please enter a valid email address.';
    return null;
}

export function validateFullName(name: string): string | null {
    const value = name.trim();
    if (!value) return 'Full name is required.';
    if (value.length < 2) return 'Full name must be at least 2 characters.';
    if (value.length > 100) return 'Full name must be 100 characters or fewer.';
    return null;
}

/**
 * Strong-password policy: ≥ 8 chars with at least one uppercase letter, one lowercase letter,
 * and one number. Returns the first failing rule's message, or null when the password is strong.
 */
export function validatePassword(password: string): string | null {
    if (!password) return 'Password is required.';
    if (password.length < PASSWORD_MIN_LENGTH) {
        return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
    }
    if (!/[A-Z]/.test(password)) return 'Password must include at least one uppercase letter.';
    if (!/[a-z]/.test(password)) return 'Password must include at least one lowercase letter.';
    if (!/[0-9]/.test(password)) return 'Password must include at least one number.';
    return null;
}

export function validateConfirmPassword(password: string, confirm: string): string | null {
    if (!confirm) return 'Please confirm your password.';
    if (password !== confirm) return 'Passwords do not match.';
    return null;
}

export interface RegistrationValues {
    name: string;
    email: string;
    password: string;
    confirm: string;
    /** Selected requested role (empty string = none). */
    role: string;
}

export function validateRegistration(values: RegistrationValues): FieldErrors {
    const errors: FieldErrors = {};
    const name = validateFullName(values.name);
    const email = validateEmail(values.email);
    const password = validatePassword(values.password);
    const confirm = validateConfirmPassword(values.password, values.confirm);
    if (name) errors.name = name;
    if (email) errors.email = email;
    if (password) errors.password = password;
    if (confirm) errors.confirm = confirm;
    if (!values.role) errors.role = 'Role selection is required.';
    return errors;
}

export interface LoginValues {
    email: string;
    password: string;
}

export function validateLogin(values: LoginValues): FieldErrors {
    const errors: FieldErrors = {};
    const email = validateEmail(values.email);
    if (email) errors.email = email;
    if (!values.password) errors.password = 'Password is required.';
    return errors;
}
