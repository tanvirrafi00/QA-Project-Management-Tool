/**
 * Auth service — login, token issuance, refresh-token rotation, and logout. Pure orchestration over
 * the user + refresh-token repositories and the shared auth helpers. Throws typed errors
 * (`UnauthorizedError`/`ForbiddenError`) which the global handler maps to HTTP status.
 */

import {
    hashPassword,
    hashToken,
    REFRESH_TTL_MS,
    signAccess,
    signRefresh,
    verifyPassword,
    verifyRefresh,
    type AuthTokens,
    type SessionUser,
    type UserRole,
} from "../../../shared/auth";
import { ConflictError, ForbiddenError, UnauthorizedError } from "../../../shared/errors";
import tokenRepository from "../repositories/refresh-token.repository";
import userRepository, { type UserRow } from "../repositories/user.repository";
import type { LoginInput } from "../types";

function toSessionUser(u: UserRow): SessionUser {
    return {
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role as UserRole,
        status: u.status,
    };
}

export const authService = {
    async register(input: {
        email: string;
        name: string;
        password: string;
        /** The role the user requests (validated requestable upstream). Becomes the default assigned role. */
        role: UserRole;
    }): Promise<SessionUser> {
        const email = input.email.toLowerCase().trim();
        const existing = await userRepository.findByEmail(email);
        // A live account in any non-rejected state still holds the email → conflict. Rejection is
        // terminal, so the way back in is to re-register: a `rejected` account is revived to
        // `pending_approval` with the new credentials (same row, preserving the id + audit trail).
        if (existing && existing.status !== "rejected") {
            throw new ConflictError("An account with this email already exists.");
        }

        const passwordHash = await hashPassword(input.password);
        if (existing) {
            const revived = await userRepository.reRegisterRejected(existing.id, {
                name: input.name.trim(),
                passwordHash,
                requestedRole: input.role,
            });
            if (!revived) {
                throw new ConflictError("This account's status just changed; please try again.");
            }
            return toSessionUser(revived);
        }

        const row = await userRepository.create({
            email,
            name: input.name.trim(),
            // The assigned role defaults to the requested role; the admin may change it at approval.
            role: input.role,
            requestedRole: input.role,
            status: "pending_approval",
            passwordHash,
        });
        return toSessionUser(row);
    },

    async login(input: LoginInput): Promise<{ user: SessionUser; tokens: AuthTokens }> {
        const user = await userRepository.findByEmail(input.email);
        if (!user) throw new UnauthorizedError("Invalid email or password");
        if (user.status !== "active") {
            throw new ForbiddenError(loginDeniedMessage(user.status));
        }

        const ok = await verifyPassword(input.password, user.passwordHash);
        if (!ok) throw new UnauthorizedError("Invalid email or password");

        await userRepository.touchLastLogin(user.id);
        const sessionUser = toSessionUser(user);
        const tokens = await this.issueTokens(user.id, sessionUser, input.userAgent, input.ip);
        return { user: sessionUser, tokens };
    },

    async issueTokens(
        userId: string,
        sessionUser: SessionUser,
        userAgent?: string,
        ip?: string,
    ): Promise<AuthTokens> {
        const accessToken = signAccess(sessionUser);
        const refreshToken = signRefresh(userId);
        const expiresAt = new Date(Date.now() + REFRESH_TTL_MS).toISOString();
        await tokenRepository.create({
            userId,
            tokenHash: hashToken(refreshToken),
            expiresAt,
            userAgent,
            ip,
        });
        return { accessToken, refreshToken };
    },

    async refresh(refreshToken: string, userAgent?: string, ip?: string): Promise<AuthTokens> {
        let payload: { sub: string };
        try {
            payload = verifyRefresh(refreshToken);
        } catch {
            throw new UnauthorizedError("Invalid or expired refresh token");
        }

        const tokenHash = hashToken(refreshToken);
        const row = await tokenRepository.findActiveByHash(tokenHash);
        if (!row || new Date(row.expiresAt).getTime() < Date.now()) {
            throw new UnauthorizedError("Invalid or expired refresh token");
        }

        // Rotation: revoke the presented token, then issue a fresh pair.
        await tokenRepository.revokeByHash(tokenHash);
        const user = await userRepository.findById(payload.sub);
        if (!user || user.status !== "active") {
            throw new UnauthorizedError("User not found or disabled");
        }
        return this.issueTokens(user.id, toSessionUser(user), userAgent, ip);
    },

    async logout(refreshToken?: string): Promise<void> {
        if (!refreshToken) return;
        await tokenRepository.revokeByHash(hashToken(refreshToken));
    },
};

/** Human-readable denial reason per non-active status (only `active` may log in). */
function loginDeniedMessage(status: string): string {
    switch (status) {
        case "pending_approval":
            return (
                "Your account is awaiting administrator approval. " +
                "You will be able to log in once your account has been approved."
            );
        case "rejected":
            return "Your account registration has been rejected. Please contact the administrator.";
        case "suspended":
            return "Your account has been suspended. Please contact the administrator.";
        default:
            return "Your account is disabled. Please contact the administrator.";
    }
}
