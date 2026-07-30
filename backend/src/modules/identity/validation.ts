/**
 * Identity input validation — field-level rules for register & login.
 *
 * Returns a structured `{ valid, errors }` so the controller can produce the standardized
 * auth error envelope `{ success: false, message, errors }` and the frontend can highlight the
 * exact fields that failed (Requirement: "Please correct the highlighted fields").
 *
 * Password policy (strong): ≥ 8 chars, with at least one uppercase, one lowercase, and one digit.
 * Name policy: 2–100 chars after trim.
 */

import { isRequestableRole } from "../../shared/auth";

export interface ValidationResult {
    valid: boolean;
    errors: Record<string, string>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Strong-password rules shared by the frontend mirror. */
export const PASSWORD_POLICY = {
    minLength: 8,
    message:
        "Password must be at least 8 characters and include an uppercase letter, a lowercase letter, and a number.",
} as const;

function describePasswordStrength(password: string): string | null {
    if (password.length < PASSWORD_POLICY.minLength) {
        return `Password must be at least ${PASSWORD_POLICY.minLength} characters.`;
    }
    if (!/[A-Z]/.test(password)) {
        return "Password must include at least one uppercase letter.";
    }
    if (!/[a-z]/.test(password)) {
        return "Password must include at least one lowercase letter.";
    }
    if (!/[0-9]/.test(password)) {
        return "Password must include at least one number.";
    }
    return null;
}

export interface RegisterPayload {
    name?: unknown;
    email?: unknown;
    password?: unknown;
    role?: unknown;
}

export function validateRegister(input: RegisterPayload): ValidationResult {
    const errors: Record<string, string> = {};

    const name = typeof input.name === "string" ? input.name.trim() : "";
    const email = typeof input.email === "string" ? input.email.trim() : "";
    const password = typeof input.password === "string" ? input.password : "";

    if (!name) {
        errors.name = "Full name is required.";
    } else if (name.length < 2) {
        errors.name = "Full name must be at least 2 characters.";
    } else if (name.length > 100) {
        errors.name = "Full name must be 100 characters or fewer.";
    }

    if (!email) {
        errors.email = "Email is required.";
    } else if (!EMAIL_RE.test(email)) {
        errors.email = "Please enter a valid email address.";
    }

    if (!password) {
        errors.password = "Password is required.";
    } else {
        const strength = describePasswordStrength(password);
        if (strength) errors.password = strength;
    }

    if (!isRequestableRole(input.role)) {
        errors.role = "Role selection is required.";
    }

    return { valid: Object.keys(errors).length === 0, errors };
}

export interface LoginPayload {
    email?: unknown;
    password?: unknown;
}

export function validateLogin(input: LoginPayload): ValidationResult {
    const errors: Record<string, string> = {};

    const email = typeof input.email === "string" ? input.email.trim() : "";
    const password = typeof input.password === "string" ? input.password : "";

    if (!email) {
        errors.email = "Email is required.";
    } else if (!EMAIL_RE.test(email)) {
        errors.email = "Please enter a valid email address.";
    }

    if (!password) {
        errors.password = "Password is required.";
    }

    return { valid: Object.keys(errors).length === 0, errors };
}
