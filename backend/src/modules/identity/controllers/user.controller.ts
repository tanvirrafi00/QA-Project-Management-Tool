/**
 * User controller — admin user-management endpoints. All routes are guarded by `authenticate` +
 * `authorize("user:manage")` at the router level; `req.user` is therefore present.
 */

import type { NextFunction, Request, Response } from "express";
import type { AccountStatus } from "../../../shared/auth";
import { ValidationError } from "../../../shared/errors";
import { userService } from "../services/user.service";
import { sendSuccess, sendCreated, sendValidationError } from "../../../shared/http/responses";

function bad(res: Response, message: string): void {
    sendValidationError(res, { general: message });
}

const VALID_STATUSES = new Set<AccountStatus>([
    "active",
    "disabled",
    "pending_approval",
    "rejected",
    "suspended",
]);

/** Coerce a `?status=` query value into a valid AccountStatus, or undefined (invalid → ignored, not 400). */
function parseStatusFilter(value: unknown): AccountStatus | undefined {
    return typeof value === "string" && VALID_STATUSES.has(value as AccountStatus)
        ? (value as AccountStatus)
        : undefined;
}

export const userController = {
    async list(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const status = parseStatusFilter(req.query.status);
            sendSuccess(res, await userService.list(status));
        } catch (err) {
            next(err);
        }
    },

    /** GET /api/users/summary — per-status counts for the admin cards + tab badges. */
    async summary(_req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            sendSuccess(res, await userService.summary());
        } catch (err) {
            next(err);
        }
    },

    async create(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { email, name, password, role } = (req.body ?? {}) as {
                email?: string;
                name?: string;
                password?: string;
                role?: string;
            };
            if (!email || !name || !password || !role) {
                return bad(res, "email, name, password, and role are required");
            }
            const user = await userService.create(
                { email, name, password, role: role as never },
                req.user!.id,
            );
            sendCreated(res, user);
        } catch (err) {
            next(err);
        }
    },

    async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            sendSuccess(res, await userService.getById(String(req.params.id)));
        } catch (err) {
            next(err);
        }
    },

    async update(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { name, role, status, password, version } = (req.body ?? {}) as {
                name?: string;
                role?: string;
                status?: string;
                password?: string;
                version?: number;
            };
            if (typeof version !== "number") {
                throw new ValidationError("version (number) is required for optimistic locking");
            }
            const user = await userService.update(
                String(req.params.id),
                version,
                { name, role: role as never, status: status as never, password },
                req.user!.id,
            );
            sendSuccess(res, user);
        } catch (err) {
            next(err);
        }
    },

    async deactivate(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            await userService.deactivate(String(req.params.id), req.user!.id);
            sendSuccess(res, { deactivated: true });
        } catch (err) {
            next(err);
        }
    },

    async assignMember(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { projectId, role } = (req.body ?? {}) as { projectId?: string; role?: string };
            if (!projectId || !role) {
                return bad(res, "projectId and role are required");
            }
            await userService.assignMember(
                String(req.params.id),
                { projectId, role: role as never },
                req.user!.id,
            );
            sendSuccess(res, { assigned: true });
        } catch (err) {
            next(err);
        }
    },

    /** GET /api/users/pending — users awaiting approval (admin). */
    async listPending(_req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            sendSuccess(res, await userService.listPending());
        } catch (err) {
            next(err);
        }
    },

    /** PATCH /api/users/:id/approve — assign role (+ optional projects) and activate. */
    async approve(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { role, projectIds, notes } = (req.body ?? {}) as {
                role?: string;
                projectIds?: unknown;
                notes?: string;
            };
            if (!role) {
                return bad(res, "role is required (qa_lead or qa_engineer)");
            }
            const normalizedProjectIds = Array.isArray(projectIds)
                ? projectIds.filter((p): p is string => typeof p === "string")
                : [];
            const user = await userService.approve(
                String(req.params.id),
                { role: role as never, projectIds: normalizedProjectIds, notes },
                req.user!.id,
            );
            sendSuccess(res, user, undefined, "User approved successfully.");
        } catch (err) {
            next(err);
        }
    },

    /** PATCH /api/users/:id/reject — mark rejected with an optional reason. */
    async reject(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            const { reason } = (req.body ?? {}) as { reason?: string };
            const user = await userService.reject(
                String(req.params.id),
                { reason },
                req.user!.id,
            );
            sendSuccess(res, user, undefined, "User rejected successfully.");
        } catch (err) {
            next(err);
        }
    },

    async suspend(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            sendSuccess(res, await userService.suspend(String(req.params.id), req.user!.id));
        } catch (err) {
            next(err);
        }
    },

    async activate(req: Request, res: Response, next: NextFunction): Promise<void> {
        try {
            sendSuccess(res, await userService.activate(String(req.params.id), req.user!.id));
        } catch (err) {
            next(err);
        }
    },
};
