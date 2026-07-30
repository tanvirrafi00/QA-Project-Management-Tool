/**
 * Auth controller — thin HTTP handlers for register/login/refresh/logout/me.
 *
 * Uses the project-standard API envelope (docs/api-standards.md §4/§8):
 *   success → { success: true, data }
 *   error   → { success: false, error, errors? }
 *
 * Validation failures carry field-level `errors` so the frontend can highlight the exact fields.
 * Service-thrown `AppError`s (conflict / forbidden / unauthorized) are mapped to their status with
 * a human-readable `error`; anything unexpected collapses to a generic 500 (no internals leaked).
 */

import type { NextFunction, Request, Response } from "express";
import activityLogRepository from "../../../shared/db/repositories/activity-log.repository";
import { REQUESTABLE_ROLE_OPTIONS } from "../../../shared/auth";
import { authService } from "../services/auth.service";
import { validateLogin, validateRegister } from "../validation";
import { sendSuccess, sendCreated, sendValidationError, sendError } from "../../../shared/http/responses";

function getRefreshToken(req: Request): string | undefined {
    const { refreshToken } = (req.body ?? {}) as { refreshToken?: unknown };
    return typeof refreshToken === "string" ? refreshToken : undefined;
}

export const authController = {
    async register(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { name, email, password, role } = (req.body ?? {}) as {
                name?: string;
                email?: string;
                password?: string;
                role?: string;
            };

            const { valid, errors } = validateRegister({ name, email, password, role });
            if (!valid) {
                sendValidationError(res, errors, "Please correct the highlighted fields.");
                return;
            }

            await authService.register({
                email: email!,
                name: name!,
                password: password!,
                role: role as never,
            });

            sendCreated(res, null, undefined, "User registered successfully");
        } catch (err) {
            next(err);
        }
    },

    /** GET /api/auth/roles — requestable roles for the registration dropdown (public). */
    async roles(_req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            sendSuccess(res, REQUESTABLE_ROLE_OPTIONS);
        } catch (err) {
            next(err);
        }
    },

    async login(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { email, password } = (req.body ?? {}) as { email?: string; password?: string };

            const { valid, errors } = validateLogin({ email, password });
            if (!valid) {
                sendValidationError(res, errors, "Please correct the highlighted fields.");
                return;
            }

            const { user, tokens } = await authService.login({
                email: email!,
                password: password!,
                userAgent: req.headers["user-agent"],
                ip: req.ip,
            });

            sendSuccess(
                res,
                { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, user },
                undefined,
                "Login successful"
            );
        } catch (err) {
            next(err);
        }
    },

    async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const refreshToken = getRefreshToken(req);
            if (!refreshToken) {
                sendValidationError(res, { refreshToken: "refreshToken is required." });
                return;
            }
            const tokens = await authService.refresh(
                refreshToken,
                req.headers["user-agent"],
                req.ip,
            );
            sendSuccess(
                res,
                { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken },
                undefined,
                "Token refreshed successfully"
            );
        } catch (err) {
            next(err);
        }
    },

    async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
        const user = req.user;
        if (!user) {
            sendError(res, 401, "Unable to logout");
            return;
        }
        try {
            const refreshToken = getRefreshToken(req);
            if (refreshToken) await authService.logout(refreshToken);

            await activityLogRepository.log({
                actorId: user.id,
                action: "user.logout",
                entityType: "user",
                entityId: user.id,
                metadata: { email: user.email, timestamp: new Date().toISOString() },
            });

            sendSuccess(res, null, undefined, "Logout successful");
        } catch (err) {
            next(err);
        }
    },

    async me(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            sendSuccess(res, { user: req.user ?? null });
        } catch (err) {
            next(err);
        }
    },
};
