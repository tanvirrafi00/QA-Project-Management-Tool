/**
 * Auth middleware — `authenticate` (verifies the Bearer access JWT and injects `req.user`) and
 * `authorize(action, scopeResolver?)` (coarse role gate + optional project-membership check).
 *
 * These exist now (Migration Roadmap Step 2) but are only applied to the existing app routers when
 * `AUTH_ENABLED=true` (flipped in Step 6). The identity routes use them immediately.
 */

import type { NextFunction, Request, Response } from "express";
import { ForbiddenError, UnauthorizedError } from "../shared/errors";
import {
    PROJECT_SCOPED_ACTIONS,
    roleHasAction,
    verifyAccess,
    type Action,
} from "../shared/auth";
import userRepository from "../modules/identity/repositories/user.repository";

/** Verify the Bearer access token and inject `req.user`. */
export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
    try {
        const header = req.headers.authorization;
        if (!header || !header.startsWith("Bearer ")) {
            throw new UnauthorizedError("Missing or malformed Authorization header");
        }
        const token = header.slice("Bearer ".length).trim();
        req.user = verifyAccess(token);
        next();
    } catch {
        next(new UnauthorizedError("Invalid or expired access token"));
    }
}

/**
 * Coarse authorization gate (requires `authenticate` to have run first).
 *
 * - Admins always pass.
 * - Otherwise the user's role must include the action.
 * - For project-scoped actions, if `scopeResolver(req)` returns a project id, non-admins must be a
 *   member of that project (admin bypasses). The authoritative project-isolation check lives in the
 *   service layer; this is the defense-in-depth gate.
 */
export function authorize(action: Action, scopeResolver?: (req: Request) => string | null | undefined) {
    return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
        try {
            const user = req.user;
            if (!user) {
                return next(new UnauthorizedError("Authentication required"));
            }
            if (user.role === "admin" || roleHasAction(user.role, action)) {
                if (scopeResolver && PROJECT_SCOPED_ACTIONS.has(action) && user.role !== "admin") {
                    const projectId = scopeResolver(req);
                    if (projectId) {
                        const ok = await userRepository.isMemberOf(user.id, projectId);
                        if (!ok) {
                            return next(new ForbiddenError("You do not have access to this project"));
                        }
                    }
                }
                return next();
            }
            return next(new ForbiddenError(`Your role (${user.role}) cannot perform "${action}"`));
        } catch (err) {
            next(err);
        }
    };
}

/**
 * `authorize` that is inert unless `AUTH_ENABLED=true`. Use this on the app routers so they stay open
 * in the default (auth-off) config and enforce the role gate only once auth is flipped on. Requires
 * `authenticate` to have run first (the mount-level `authGate` applies it when auth is on).
 */
export function maybeAuthorize(
    action: Action,
    scopeResolver?: (req: Request) => string | null | undefined,
) {
    if (process.env.AUTH_ENABLED !== "true") {
        return function skipAuth(_req: Request, _res: Response, next: NextFunction): void {
            next();
        };
    }
    return authorize(action, scopeResolver);
}
